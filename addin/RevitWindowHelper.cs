using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace VH_IFC_QR
{
    internal static class RevitWindowHelper
    {
        private const int SwRestore = 9;
        private static readonly HashSet<Window> PreparedWindows = new HashSet<Window>();

        public static void KeepOnTop(Window window)
        {
            if (window == null)
                return;

            lock (PreparedWindows)
            {
                if (!PreparedWindows.Add(window))
                    return;
            }

            window.ShowInTaskbar = false;
            window.Topmost = true;

            window.SourceInitialized += (sender, args) =>
            {
                TrySetRevitOwner(window);
                BringToFront(window);
            };

            window.Loaded += (sender, args) => BringToFront(window);
            window.Activated += (sender, args) => BringToFront(window);
            window.Closed += (sender, args) =>
            {
                lock (PreparedWindows)
                    PreparedWindows.Remove(window);
            };
        }

        public static MessageBoxResult ShowMessage(
            Window owner,
            string message,
            string caption,
            MessageBoxButton buttons,
            MessageBoxImage icon)
        {
            if (owner != null)
            {
                KeepOnTop(owner);
                BringToFront(owner);
                return MessageBox.Show(owner, message, caption, buttons, icon);
            }

            return MessageBox.Show(message, caption, buttons, icon);
        }

#pragma warning disable CA1416
        public static Forms.DialogResult ShowDialog(Forms.CommonDialog dialog, Window owner)
        {
            if (dialog == null)
                return Forms.DialogResult.Cancel;

            IntPtr ownerHandle = GetWindowHandle(owner);
            if (ownerHandle == IntPtr.Zero)
                ownerHandle = GetRevitMainWindowHandle();

            return ownerHandle == IntPtr.Zero
                ? dialog.ShowDialog()
                : dialog.ShowDialog(new Win32WindowOwner(ownerHandle));
        }
#pragma warning restore CA1416

        private static void TrySetRevitOwner(Window window)
        {
            try
            {
                IntPtr ownerHandle = GetRevitMainWindowHandle();
                WindowInteropHelper helper = new WindowInteropHelper(window);
                if (ownerHandle != IntPtr.Zero && ownerHandle != helper.Handle)
                    helper.Owner = ownerHandle;
            }
            catch
            {
                // Topmost still keeps the window visible if Revit ownership cannot be attached.
            }
        }

        private static void BringToFront(Window window)
        {
            if (window == null)
                return;

            window.Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    window.Topmost = true;
                    window.Activate();

                    IntPtr handle = GetWindowHandle(window);
                    if (handle != IntPtr.Zero)
                    {
                        ShowWindow(handle, SwRestore);
                        SetForegroundWindow(handle);
                    }
                }
                catch
                {
                    // Best effort only: the dialog should never fail because focus could not be forced.
                }
            }), DispatcherPriority.ApplicationIdle);
        }

        private static IntPtr GetWindowHandle(Window window)
        {
            if (window == null)
                return IntPtr.Zero;

            try
            {
                return new WindowInteropHelper(window).Handle;
            }
            catch
            {
                return IntPtr.Zero;
            }
        }

        private static IntPtr GetRevitMainWindowHandle()
        {
            try
            {
                return Process.GetCurrentProcess().MainWindowHandle;
            }
            catch
            {
                return IntPtr.Zero;
            }
        }

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private sealed class Win32WindowOwner : Forms.IWin32Window
        {
            public Win32WindowOwner(IntPtr handle)
            {
                Handle = handle;
            }

            public IntPtr Handle { get; }
        }
    }
}
