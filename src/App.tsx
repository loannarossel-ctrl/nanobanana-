/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import PromptMaker from './components/PromptMaker';
import { Toaster } from './components/ui/sonner';
import { ThemeProvider } from 'next-themes';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <PromptMaker />
      <Toaster position="top-center" />
    </ThemeProvider>
  );
}


