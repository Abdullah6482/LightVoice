import { useEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import html from '../services/pdf/runtime.generated';
import { finishPDF, getPDFJob, subscribePDF } from '../services/pdf/PDFService';

export function PDFExtractionHost() {
  const job = useSyncExternalStore(subscribePDF, getPDFJob, getPDFJob);
  const view = useRef<WebView>(null);
  useEffect(() => () => {
    const pending = getPDFJob();
    if (pending) finishPDF(pending.id, undefined, 'PDF import was interrupted. Please try again.');
  }, []);
  if (!job) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hidden}>
    <WebView key={job.id} ref={view} source={{ html }} originWhitelist={['about:blank']}
      javaScriptEnabled allowFileAccess={false} allowUniversalAccessFromFileURLs={false}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onError={() => finishPDF(job.id, undefined, 'The PDF reader could not start. Please update Android System WebView and try again.')}
      onContentProcessDidTerminate={() => finishPDF(job.id, undefined, 'PDF extraction ran out of resources. Try a smaller file.')}
      onRenderProcessGone={() => { finishPDF(job.id, undefined, 'PDF extraction ran out of resources. Try a smaller file.'); }}
      onMessage={event => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'ready') view.current?.injectJavaScript(`window.lightVoiceExtract(${JSON.stringify(job.base64)});true;`);
          else if (message.type === 'progress') job.progress(`Reading PDF page ${message.page}…`);
          else if (message.type === 'result') finishPDF(job.id, message.book);
          else if (message.type === 'error') finishPDF(job.id, undefined, message.message);
        } catch { finishPDF(job.id, undefined, 'Invalid response while reading PDF.'); }
      }}
    />
  </View>;
}
const styles = StyleSheet.create({ hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' } });
