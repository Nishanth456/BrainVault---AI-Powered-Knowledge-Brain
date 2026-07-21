# BrainVault Frontend Documentation

## Overview

The BrainVault frontend is a modern, highly interactive, and responsive web application built with **Next.js**. It serves as the user's window into their AI-powered personal knowledge brain, featuring a premium design aesthetic with dynamic micro-animations, sleek dark mode support, and seamless user experiences.

## Technical Stack

The frontend leverages cutting-edge web technologies to deliver performance and aesthetics:

- **Framework:** **Next.js 16.2** (App Router) - Provides server-side rendering, static site generation, and powerful file-system based routing.
- **Core Library:** **React 19** - The latest version of React for building the user interface.
- **Styling:** **Tailwind CSS v4** - A utility-first CSS framework used for rapid UI development, allowing for highly customized and responsive layouts without leaving the HTML/JSX.
- **UI Components:** 
  - **shadcn/ui**: Reusable components built using Radix UI and Tailwind CSS, ensuring accessibility and a beautiful default aesthetic.
  - **@base-ui/react**: Provides unstyled, accessible foundational components.
- **Icons:** **lucide-react** - A clean, consistent icon set.
- **Animations:** 
  - **framer-motion**: Used for complex, physics-based micro-animations, page transitions, and dynamic UI feedback.
  - **tw-animate-css**: Tailwind animation utilities.
- **Data Fetching:** **Axios** - For making robust HTTP requests to the FastAPI backend.
- **Notifications:** **sonner** - An opinionated toast component for React, providing sleek, unobtrusive user feedback.
- **Document Viewing:** **react-pdf** (and `pdfjs-dist`) - Embedded directly in the frontend to render stored PDF documents seamlessly.

## Key Technical Details

1. **App Router Architecture:** The project uses the Next.js `app/` directory structure, allowing for nested layouts, error boundaries, and streamlined data fetching strategies.
2. **Component-Driven Design:** The UI is heavily modularized into components (e.g., `QnACard`, `LinkedInReader`, `LinkedInCard`), ensuring maintainability and reusability across different knowledge domains.
3. **Type Safety:** The entire codebase is strictly typed using **TypeScript** (`tsconfig.json`), preventing runtime errors and improving developer experience with comprehensive intellisense.
4. **Theme Management:** Utilizes `next-themes` to support robust light/dark mode toggling, enhancing the premium aesthetic requirements.
5. **Linting & Code Quality:** Enforced through standard `eslint` configurations to maintain a clean and consistent codebase.

## Design Philosophy

The frontend is strictly designed to prioritize visual excellence. It moves away from generic, plain UI and leans into rich aesthetics—utilizing curated color palettes, glassmorphism, smooth gradients, and purposeful hover states to ensure an engaging "wow" factor upon first use.

## Recent Functional Highlights

1. **Ask AI (Document RAG):** Users can chat directly with long PDFs or attached documents. This feature seamlessly ties into the backend's chunked embedding system. The UI intelligently suppresses redundant source citations when asking questions about a single document, while maintaining the same chat session for follow-up questions.
2. **Chat History Management:** The Brain Talk interface provides a persistent chat history sidebar. Users can manually delete individual chats via a hover-over trash action. The UI is designed to automatically clear the active view if the currently open chat is deleted.
3. **Direct File Downloads:** The knowledge cards feature an updated export system that directly downloads original attachments (like PDFs) from the backend MinIO proxy, only appearing when an attachment is actually present.
4. **Learning Path Enhancements:** The learning path generator UI dynamically detects and indicates if a path has already been saved to the user's vault, preventing accidental duplicate saves.
