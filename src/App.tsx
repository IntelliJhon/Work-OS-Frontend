import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SocketProvider } from './services/socket/socket-provider';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { AuthProvider } from './app/providers/AuthProvider';
import { AppRouter } from './app/router';
import { queryClient } from './services/api/queryClient';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';
import { ScreenProtection } from './components/security/ScreenProtection';
import { AttendanceCheckIn } from './components/attendance/AttendanceCheckIn';

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <ConfirmProvider>
              <ToastProvider>
                <AppRouter />
                <ScreenProtection />
                <AttendanceCheckIn />
              </ToastProvider>
            </ConfirmProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
