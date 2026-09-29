package expo.modules.lightvoice

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.*
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

/** The service, not React/JS timers, owns speech and progress while the screen is off. */
class NarrationService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private val prefs by lazy { getSharedPreferences("lightvoice-playback", MODE_PRIVATE) }
  private lateinit var media: MediaSession
  private lateinit var audio: AudioManager
  private lateinit var wake: PowerManager.WakeLock
  private var focus: AudioFocusRequest? = null
  private var tts: TextToSpeech? = null
  private var voiceReady = false
  private var voiceFailed = false
  private var mode = "idle"
  private var book: JSONObject? = null
  private var chapters = JSONArray()
  private var chapterIndex = 0
  private var text = ""
  private var offset = 0
  private var rate = 1.0
  private var continuous = true
  private var voiceId = ""
  private var sleepAt = 0L
  private var sleepChapter = false
  private var generation = 0
  private var utterance = ""
  private var passageStart = 0
  private var passageEnd = 0
  private var errorMessage: String? = null
  private var lastPersist = 0L
  private var foreground = false
  private var destroyed = false
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change != AudioManager.AUDIOFOCUS_GAIN) main.post { pausePlayback() }
  }
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) { if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) pausePlayback() }
  }
  private val tick = object : Runnable {
    override fun run() {
      if (sleepAt > 0 && System.currentTimeMillis() >= sleepAt) { sleepAt = 0; sleepChapter = false; pausePlayback() }
      if (mode == "playing" && !wake.isHeld) wake.acquire(10 * 60 * 1000L)
      main.postDelayed(this, 1000)
    }
  }

  override fun onCreate() {
    super.onCreate()
    PlaybackBridge.service = this
    PlaybackBridge.running = true
    audio = getSystemService(AUDIO_SERVICE) as AudioManager
    wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LightVoice:Narration")
    wake.setReferenceCounted(false)
    media = MediaSession(this, "LightVoice")
    media.setCallback(object : MediaSession.Callback() {
      override fun onPlay() { safely { ensureForeground(); play() } }
      override fun onPause() { pausePlayback() }
      override fun onStop() { pausePlayback(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
      override fun onSkipToNext() { safely { move(1) } }
      override fun onSkipToPrevious() { safely { move(-1) } }
    }, main)
    if (Build.VERSION.SDK_INT >= 26) (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL, "Book narration", NotificationManager.IMPORTANCE_LOW))
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED)
    else @Suppress("DEPRECATION") registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
    restore()
    main.post(tick)
    tts = TextToSpeech(this) { status -> main.post {
      if (destroyed) return@post
      voiceReady = status == TextToSpeech.SUCCESS
      if (voiceReady) {
        val available = tts?.setLanguage(Locale.ENGLISH) ?: TextToSpeech.LANG_NOT_SUPPORTED
        voiceReady = available >= TextToSpeech.LANG_AVAILABLE
        // Never send book text to a network-only TTS voice without the user's consent.
        voiceReady = voiceReady && chooseVoice()
        tts?.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String?) {}
          override fun onStop(id: String?, interrupted: Boolean) { main.post { if (id == utterance && mode == "playing") pausePlayback() } }
          override fun onDone(id: String?) { main.post { if (id == utterance && mode == "playing") { offset = passageEnd; publish(true); safely { speakNext() } } } }
          @Deprecated("Legacy TTS callback") override fun onError(id: String?) { main.post { if (id == utterance) fail("The installed device voice could not speak. Check Android text-to-speech settings.") } }
          override fun onRangeStart(id: String?, start: Int, end: Int, frame: Int) { main.post {
            if (id == utterance && mode == "playing") { offset = (passageStart + start).coerceIn(passageStart, passageEnd); publish(false) }
          } }
        })
      }
      voiceFailed = !voiceReady
      if (!voiceReady && mode == "playing") fail("Install an offline English text-to-speech voice in Android Settings, then reopen LightVoice.")
      else if (mode == "playing") safely { speakNext() }
    } }
  }

  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    safely {
      ensureForeground() // Must happen immediately after startForegroundService, including restore.
      val commandFile = intent?.getStringExtra("commandFile")
      val command = if (commandFile != null) {
        val file = File(commandFile).canonicalFile
        require(file.parentFile == cacheDir.canonicalFile && file.name.startsWith("playback-command-"))
        try { JSONObject(file.readText()) } finally { file.delete() }
      } else JSONObject().put("action", intent?.action ?: "pause")
      when (command.optString("action")) {
        "load" -> {
          pausePlayback()
          book = command.getJSONObject("book"); chapters = command.getJSONArray("chapters")
          rate = command.optDouble("rate", rate).coerceIn(0.5, 2.0); continuous = command.optBoolean("continuous", continuous)
          voiceId = command.optString("voiceId", voiceId)
          if (voiceReady) { voiceReady = chooseVoice(); voiceFailed = !voiceReady }
          chapterIndex = (0 until chapters.length()).firstOrNull { chapters.getJSONObject(it).optString("id") == command.optString("chapterId") } ?: 0
          loadChapter(command.optInt("offset", 0), command.optBoolean("autoplay", true))
        }
        "play" -> play()
        "pause" -> pausePlayback()
        "next" -> move(1)
        "previous" -> move(-1)
        "stop" -> { pausePlayback(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
        "move" -> move(command.optInt("direction"))
        "seek" -> {
          val resume = mode == "playing"; silence()
          if (text.isEmpty()) loadChapter(command.optInt("offset"), resume)
          else { offset = safeOffset(command.optInt("offset")); if (resume) play() else { mode = "paused"; publish(true) } }
        }
        "settings" -> {
          val resume = mode == "playing"; silence()
          rate = command.optDouble("rate", rate).coerceIn(0.5, 2.0); continuous = command.optBoolean("continuous", continuous)
          voiceId = command.optString("voiceId", voiceId)
          if (voiceReady || voiceFailed) { voiceReady = chooseVoice(); voiceFailed = !voiceReady }
          if (resume) play() else publish(true)
        }
        "sleep" -> {
          sleepChapter = command.optString("value") == "chapter"
          sleepAt = if (command.optDouble("value", 0.0) > 0) System.currentTimeMillis() + (command.getDouble("value") * 60000).toLong() else 0L
          publish(true)
        }
      }
      if (mode != "playing" && mode != "loading") demote()
    }
    intent?.getStringExtra("commandFile")?.let { PlaybackBridge.completions.remove(File(it).name)?.invoke() }
    return START_NOT_STICKY // Never start speaking spontaneously after process death.
  }

  private fun chooseVoice(): Boolean {
    val offline = tts?.voices.orEmpty().filter { it.locale.language == "en" && !it.isNetworkConnectionRequired && !it.features.orEmpty().contains("notInstalled") }
    val selected = if (voiceId.isNotEmpty()) offline.find { it.name == voiceId } else offline.maxByOrNull { it.quality }
    return selected != null && tts?.setVoice(selected) == TextToSpeech.SUCCESS
  }
  fun pauseForPreview() { pausePlayback() }
  fun forgetBook(id: String) {
    if (book?.optString("id") != id) return
    pausePlayback()
    book = null; chapters = JSONArray(); chapterIndex = 0; text = ""; offset = 0
    sleepAt = 0; sleepChapter = false; mode = "idle"; errorMessage = null
    publish(true)
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION)
  }

  private fun safely(action: () -> Unit) { try { action() } catch (error: Exception) { fail(error.message ?: "Playback failed") } }
  private fun currentChapter(): JSONObject? = chapters.optJSONObject(chapterIndex)
  private fun restore() {
    runCatching {
      val saved = JSONObject(prefs.getString("state", null) ?: return)
      book = saved.optJSONObject("book"); chapters = saved.optJSONArray("chapters") ?: JSONArray()
      val id = saved.optJSONObject("chapter")?.optString("id")
      chapterIndex = (0 until chapters.length()).firstOrNull { chapters.getJSONObject(it).optString("id") == id } ?: 0
      offset = saved.optInt("offset"); rate = saved.optJSONObject("settings")?.optDouble("playbackRate", 1.0) ?: 1.0
      continuous = saved.optJSONObject("settings")?.optBoolean("continueToNextChapter", true) ?: true
      voiceId = saved.optJSONObject("settings")?.optString("voiceId", "") ?: ""
      mode = if (book == null) "idle" else "paused"
    }.onFailure { book = null; chapters = JSONArray(); mode = "idle" }
  }
  private fun loadChapter(position: Int, autoplay: Boolean) {
    silence(); val token = generation
    val chapter = currentChapter() ?: error("This book has no chapters")
    text = ""; offset = position; mode = "loading"; publish(true)
    io.execute {
      val result = runCatching {
        val uri = Uri.parse(chapter.getString("textPath"))
        require(uri.scheme == "file") { "Chapter text must be stored on this device" }
        val file = File(uri.path ?: error("Missing chapter file")).canonicalFile
        require(file.path.startsWith(filesDir.canonicalPath + File.separator)) { "Chapter file is outside app storage" }
        require(file.length() <= 12 * 1024 * 1024) { "Chapter is too large" }
        file.readText().also { require(it.isNotBlank()) { "Chapter has no readable text" } }
      }
      main.post {
        if (destroyed || token != generation) return@post
        result.onSuccess { value -> text = value; offset = safeOffset(position); mode = "paused"; if (autoplay) safely { play() } else { publish(true); demote() } }
          .onFailure { fail(it.message ?: "Unable to read chapter") }
      }
    }
  }
  private fun safeOffset(value: Int): Int {
    var result = value.coerceIn(0, text.length)
    if (result == text.length) return result
    while (result > 0 && !text[result - 1].isWhitespace()) result--
    return result
  }
  private fun silence() { generation++; utterance = ""; tts?.stop() }
  private fun play() {
    if (book == null || mode == "loading") return
    if (text.isEmpty()) { loadChapter(offset, true); return }
    if (voiceFailed) { fail("The device voice is unavailable. Install an English voice and restart LightVoice."); return }
    ensureForeground()
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    val granted = if (Build.VERSION.SDK_INT >= 26) {
      if (focus == null) focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes).setWillPauseWhenDucked(true).setOnAudioFocusChangeListener(focusListener, main).build()
      audio.requestAudioFocus(focus!!)
    } else { @Suppress("DEPRECATION") audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) }
    if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { fail("Another app is using audio. Try Play again."); return }
    if (offset >= text.length) offset = 0
    errorMessage = null; mode = "playing"
    if (!wake.isHeld) wake.acquire(10 * 60 * 1000L)
    publish(true)
    if (voiceReady) speakNext()
  }
  private fun speakNext() {
    if (mode != "playing" || !voiceReady) return
    if (sleepAt > 0 && System.currentTimeMillis() >= sleepAt) { sleepAt = 0; pausePlayback(); return }
    if (offset >= text.length) {
      if (sleepChapter) { sleepChapter = false; pausePlayback(); return }
      if (continuous && chapterIndex + 1 < chapters.length()) { chapterIndex++; loadChapter(0, true); return }
      pausePlayback(); mode = "ended"; publish(true); return
    }
    passageStart = offset
    var end = (offset + minOf(240, TextToSpeech.getMaxSpeechInputLength())).coerceAtMost(text.length)
    if (end < text.length) {
      var boundary = end
      while (boundary > offset && !text[boundary - 1].isWhitespace()) boundary--
      if (boundary > offset) end = boundary
      else if (end > offset && text[end - 1].isHighSurrogate()) end--
    }
    passageEnd = end
    utterance = "${++generation}-$offset"
    tts?.setSpeechRate(rate.toFloat())
    if (tts?.speak(text.substring(offset, end), TextToSpeech.QUEUE_FLUSH, Bundle(), utterance) == TextToSpeech.ERROR) fail("Speech playback failed")
  }
  private fun pausePlayback() {
    silence()
    mode = if (book == null) "idle" else "paused"
    if (wake.isHeld) wake.release()
    if (Build.VERSION.SDK_INT >= 26) focus?.let { audio.abandonAudioFocusRequest(it) }
    else @Suppress("DEPRECATION") audio.abandonAudioFocus(focusListener)
    publish(true); demote()
  }
  private fun move(direction: Int) {
    val next = chapterIndex + direction.coerceIn(-1, 1)
    if (next !in 0 until chapters.length()) return
    val resume = mode == "playing"
    publish(true); chapterIndex = next; loadChapter(0, resume)
  }
  private fun fail(message: String) { pausePlayback(); errorMessage = message; mode = "error"; publish(true) }
  private fun publish(force: Boolean) {
    val now = System.currentTimeMillis()
    val state = JSONObject().put("ready", true).put("mode", mode).put("book", book ?: JSONObject.NULL)
      .put("chapters", chapters).put("chapter", currentChapter() ?: JSONObject.NULL)
      .put("offset", offset).put("length", text.length).put("excerpt", text.substring(offset.coerceIn(0, text.length), (offset + 240).coerceIn(0, text.length)))
      .put("settings", JSONObject().put("playbackRate", rate).put("continueToNextChapter", continuous).put("voiceId", voiceId))
      .put("sleep", if (sleepChapter) "chapter" else if (sleepAt > 0) sleepAt else JSONObject.NULL)
      .put("error", errorMessage ?: JSONObject.NULL).put("updatedAt", now)
    val json = state.toString()
    PlaybackBridge.emit(json)
    if (force || now - lastPersist >= 3000) {
      val editor = prefs.edit().putString("state", json)
      if (book != null && currentChapter() != null && mode != "loading") editor.putString("progress-${book!!.getString("id")}", JSONObject()
        .put("bookId", book!!.getString("id")).put("chapterId", currentChapter()!!.getString("id"))
        .put("textOffset", offset).put("positionMs", 0).put("playbackRate", rate).put("updatedAt", now).toString())
      editor.apply(); lastPersist = now
      updateMedia()
    }
  }
  private fun updateMedia() {
    media.isActive = book != null
    media.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, currentChapter()?.optString("title") ?: "LightVoice")
      .putString(MediaMetadata.METADATA_KEY_ARTIST, book?.optString("title") ?: "Device narration").build())
    val state = when (mode) { "playing" -> PlaybackState.STATE_PLAYING; "loading" -> PlaybackState.STATE_BUFFERING; "error" -> PlaybackState.STATE_ERROR; else -> PlaybackState.STATE_PAUSED }
    media.setPlaybackState(PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP or PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS)
      .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (mode == "playing") rate.toFloat() else 0f).build())
    if (foreground || book != null) (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION, notification())
  }
  private fun notification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    fun action(name: String, icon: Int, label: String): Notification.Action {
      val intent = Intent(this, NarrationService::class.java).setAction(name)
      val pending = if (Build.VERSION.SDK_INT >= 26) PendingIntent.getForegroundService(this, name.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      else PendingIntent.getService(this, name.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      return Notification.Action.Builder(icon, label, pending).build()
    }
    builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(currentChapter()?.optString("title") ?: "LightVoice")
      .setContentText(book?.optString("title") ?: "Preparing narration…").setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(mode == "playing").setCategory(Notification.CATEGORY_TRANSPORT)
      .addAction(action("previous", android.R.drawable.ic_media_previous, "Previous"))
      .addAction(action(if (mode == "playing") "pause" else "play", if (mode == "playing") android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play, if (mode == "playing") "Pause" else "Play"))
      .addAction(action("next", android.R.drawable.ic_media_next, "Next"))
      .addAction(action("stop", android.R.drawable.ic_menu_close_clear_cancel, "Stop"))
      .setStyle(Notification.MediaStyle().setMediaSession(media.sessionToken).setShowActionsInCompactView(0, 1, 2))
    packageManager.getLaunchIntentForPackage(packageName)?.let { builder.setContentIntent(PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)) }
    return builder.build()
  }
  private fun ensureForeground() {
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(NOTIFICATION, notification())
    foreground = true
  }
  private fun demote() { if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false } }
  override fun onDestroy() {
    destroyed = true
    pausePlayback(); main.removeCallbacksAndMessages(null); io.shutdownNow(); tts?.shutdown(); media.release()
    runCatching { unregisterReceiver(noisy) }
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION)
    PlaybackBridge.running = false
    PlaybackBridge.service = null
    super.onDestroy()
  }
  companion object { const val CHANNEL = "lightvoice-narration"; const val NOTIFICATION = 7301 }
}
