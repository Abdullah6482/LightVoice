package expo.modules.lightvoice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import android.speech.tts.TextToSpeech
import expo.modules.kotlin.Promise

class LightVoicePlaybackModule : Module() {
  private val listener: (String) -> Unit = { value -> sendEvent("state", mapOf("json" to value)) }
  override fun definition() = ModuleDefinition {
    Name("LightVoicePlayback")
    Events("state")
    AsyncFunction("preparePreview") { promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        runCatching { PlaybackBridge.service?.pauseForPreview() }
          .onSuccess { promise.resolve(null) }.onFailure { promise.reject("PREVIEW", it.message, it) }
      }
    }
    AsyncFunction("forgetBook") { bookId: String, promise: Promise ->
      val context = appContext.reactContext ?: error("Android context is unavailable")
      Handler(Looper.getMainLooper()).post {
        runCatching {
          require(bookId.matches(Regex("[a-zA-Z0-9-]+")))
          PlaybackBridge.service?.forgetBook(bookId)
          val prefs = context.getSharedPreferences("lightvoice-playback", Context.MODE_PRIVATE)
          val editor = prefs.edit().remove("progress-$bookId")
          val saved = PlaybackBridge.snapshot(context)
          if (saved != null && JSONObject(saved).optJSONObject("book")?.optString("id") == bookId) {
            editor.remove("state"); PlaybackBridge.current = null
          }
          check(editor.commit()) { "Unable to clear saved playback" }
        }.onSuccess { promise.resolve(null) }.onFailure { promise.reject("DELETE", it.message, it) }
      }
    }
    AsyncFunction("voices") { promise: Promise ->
      val context = appContext.reactContext ?: error("Android context is unavailable")
      val handler = Handler(Looper.getMainLooper())
      handler.post {
        var engine: TextToSpeech? = null
        var finished = false
        val timeout = Runnable { if (!finished) { finished = true; engine?.shutdown(); promise.reject("VOICES", "Voice discovery timed out. Try again.", null) } }
        handler.postDelayed(timeout, 10000)
        engine = TextToSpeech(context) { status -> handler.post {
          if (!finished) {
            finished = true; handler.removeCallbacks(timeout)
            runCatching {
              check(status == TextToSpeech.SUCCESS) { "Text-to-speech is unavailable" }
              engine?.voices.orEmpty().filter { it.locale.language == "en" && !it.isNetworkConnectionRequired && !it.features.orEmpty().contains("notInstalled") }
                .sortedBy { it.name }.map { mapOf("identifier" to it.name, "name" to it.name, "language" to it.locale.toLanguageTag()) }
            }.onSuccess { promise.resolve(it) }.onFailure { promise.reject("VOICES", it.message, it) }
            engine?.shutdown()
          }
        } }
      }
    }
    OnCreate { PlaybackBridge.listeners.add(listener) }
    OnDestroy { PlaybackBridge.listeners.remove(listener) }
    AsyncFunction("snapshot") {
      val context = appContext.reactContext ?: error("Android context is unavailable")
      PlaybackBridge.snapshot(context)
    }
    AsyncFunction("progress") { bookId: String ->
      val context = appContext.reactContext ?: error("Android context is unavailable")
      context.getSharedPreferences("lightvoice-playback", Context.MODE_PRIVATE).getString("progress-$bookId", null)
    }
    AsyncFunction("command") { json: String, promise: Promise ->
      val context = appContext.reactContext ?: error("Android context is unavailable")
      val command = JSONObject(json)
      require(command.optString("action") in setOf("load", "play", "pause", "seek", "move", "settings", "sleep")) { "Unknown playback command" }
      // A queue manifest can exceed Android's Binder transaction limit. Pass a private file instead.
      val file = File.createTempFile("playback-command-", ".json", context.cacheDir)
      file.writeText(json)
      PlaybackBridge.completions[file.name] = { promise.resolve(null) }
      try {
        val intent = Intent(context, NarrationService::class.java).putExtra("commandFile", file.absolutePath)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      } catch (error: Exception) { PlaybackBridge.completions.remove(file.name); file.delete(); throw error }
      Unit
    }
  }
}

object PlaybackBridge {
  var service: NarrationService? = null // Accessed only on the Android main thread.
  val completions = java.util.concurrent.ConcurrentHashMap<String, () -> Unit>()
  val listeners = java.util.concurrent.CopyOnWriteArraySet<(String) -> Unit>()
  @Volatile var current: String? = null
  @Volatile var running = false
  fun snapshot(context: Context): String? {
    val stored = current ?: context.getSharedPreferences("lightvoice-playback", Context.MODE_PRIVATE).getString("state", null) ?: return null
    val json = JSONObject(stored)
    if (!running) { json.put("mode", "paused"); json.put("sleep", JSONObject.NULL) }
    return json.toString()
  }
  fun emit(value: String) {
    current = value
    Handler(Looper.getMainLooper()).post { listeners.forEach { runCatching { it(value) } } }
  }
}
