import { extractPDF } from '../src/services/pdf/extract.mjs';

const send = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
window.lightVoiceExtract = async (base64) => {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const book = await extractPDF(bytes, page => send({ type: 'progress', page }));
    send({ type: 'result', book });
  } catch (error) {
    send({ type: 'error', message: error?.name === 'PasswordException' ? 'Password-protected PDFs are not supported. Choose an unlocked copy.' : error?.message || 'This PDF could not be read.' });
  }
};
send({ type: 'ready' });
