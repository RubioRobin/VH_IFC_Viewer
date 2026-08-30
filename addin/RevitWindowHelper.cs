using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;

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

        public static MessageBoxResult ShowMessage(Window owner, string message, string title, MessageBoxButton buttons, MessageBoxImage image)
        {
            KeepOnTop(owner);
            return owner == null
                ? MessageBox.Show(message, title, buttons, image)
                : MessageBox.Show(owner, message, title, buttons, image);
        }

        [SupportedOSPlatform("windows")]
        public static System.Windows.Forms.DialogResult ShowDialog(System.Windows.Forms.CommonDialog dialog, Window owner)
        {
            if (dialog == null) throw new ArgumentNullException(nameof(dialog));
            IntPtr handle = GetWindowHandle(owner);
            return dialog.ShowDialog(handle == IntPtr.Zero ? null : new NativeWindow(handle));
        }

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

        private sealed class NativeWindow : System.Windows.Forms.IWin32Window
        {
            public NativeWindow(IntPtr handle) => Handle = handle;
            public IntPtr Handle { get; }
        }
    }
}
