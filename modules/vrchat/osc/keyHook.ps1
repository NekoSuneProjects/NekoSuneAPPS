# modules/vrchat/osc/keyHook.ps1
# Global low-level keyboard hook (WH_KEYBOARD_LL), same technique as the
# reference C# AvatarScalingController's InstallHook(). Emits one JSON line
# per key event to stdout: {"t":"down","vk":38} / {"t":"up","vk":38}
# Only run while a feature that needs it is actively enabled (see
# keyHookPs.js) - never started automatically at app launch.

$src = @"
using System;
using System.Runtime.InteropServices;

public static class NkKeyHook {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookId = IntPtr.Zero;

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            long msg = wParam.ToInt64();
            if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYUP) {
                KBDLLHOOKSTRUCT k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                string ev = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) ? "down" : "up";
                Console.WriteLine("{\"t\":\"" + ev + "\",\"vk\":" + k.vkCode + "}");
                Console.Out.Flush();
            }
        }
        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    public static void Run() {
        _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(null), 0);
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0)) { }
        UnhookWindowsHookEx(_hookId);
    }
}
"@

Add-Type -TypeDefinition $src -Language CSharp
[NkKeyHook]::Run()
