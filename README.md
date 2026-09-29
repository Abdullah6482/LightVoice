# LightVoice

Personal offline EPUB & PDF library and audiobook reader built with Expo SDK 57, React Native, and TypeScript. Designed mobile-first with Android as the primary target.

---

## ✨ Features

- **📚 Offline Library**: Import EPUB and PDF books with automated cover extraction, spine parsing, and metadata indexing.
- **📑 Chapter Navigation**: Smart chapter segmentation from EPUB spines and PDF contents/bookmarks, complete with coverage reports for non-narrated front/back matter.
- **🎙️ Device TTS Narration**: Listen to your books using high-quality on-device text-to-speech without any external cloud API calls or subscriptions.
- **⏯️ Full Playback Controls**: Pause/resume, scrubber/slider for chapter position, adjustable playback speeds, previous/next chapter navigation, and continuous reading.
- **⏱️ Sleep Timers**: Configurable timer intervals (10, 15, 30, 45, 60 minutes) or automatically stop at the end of the chapter.
- **⚡ Offline-First Architecture**: App storage handles files locally, and all metadata and playback positions are committed via a serialized SQLite database.
- **🎧 Android Background Playback**: Native narration service support in development builds for screen-off listening, audio-focus handling, and lock-screen controls.

---

## 🛠️ Tech Stack

- **Framework**: [Expo](https://expo.dev/) (SDK 57) / [React Native](https://reactnative.dev/) (0.86)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based routing)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: `expo-sqlite` (Single-connection serialized SQLite)
- **Speech Engine**: `expo-speech` (Device Text-to-Speech)
- **PDF Engine**: Bundled [PDF.js](https://mozilla.github.io/pdf.js/) via `react-native-webview`
- **EPUB Parser**: `jszip`, `fast-xml-parser`, `htmlparser2`

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `22.13.0` or later (Node 24 LTS supported)
- **Package Manager**: `npm`

### Installation

```bash
# Clone the repository
git clone https://github.com/Abdullah6482/LightVoice.git
cd LightVoice

# Install dependencies
npm ci

# Start the Expo development server
npm start
```

Open the project in an Expo Go client or run a development build:

```bash
# Android
npm run android

# iOS
npm run ios

# Web
npm run web
```

---

## 🧪 Verification & Quality Checks

Run the automated test suite, typechecker, and linter:

```bash
# Run unit & integration tests
npm test

# Typecheck TypeScript files
npm run typecheck

# Lint project files
npm run lint

# Diagnose Expo configuration
npm run doctor
```

---

## 📖 Further Documentation

Detailed architecture specifications and setup guides are available in the [`docs/`](docs/) directory:
- [Development Notes & Milestone Specifications](docs/development-notes.md)
- [Android Background Playback Setup & Checklist](docs/android-background-playback.md)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
