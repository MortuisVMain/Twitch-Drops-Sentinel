# 075. MSVC x64 uses a hidden return buffer for CSteamID

## Context

Valve's C++ `ISteamUser::GetSteamID` returns a `CSteamID` class by value. The class stores 64 bits, but its C++ declaration and the x64 member-function ABI determine the call signature. The Steamworks flat API's integer result applies to that separate wrapper entry point. [Valve C++ declarations](https://github.com/ValveSoftware/source-sdk-2013/tree/e1f1fd42271805072f052051c26c21caa2c87b04/src/public/steam)

## Verified behavior

For an independently written class with the relevant constructor and private union layout, MSVC x64 generated a virtual call with `this` in `RCX` and an eight-byte hidden return buffer address in `RDX`. The callee returned that address in `RAX`. Treating the slot as an integer-returning method would omit the buffer and could corrupt memory.

The managed delegate passes the interface pointer and an `out ulong` buffer. The offline test calls that same delegate against the virtual method in a compiled C++ fixture and checks the returned bits. Keep the architecture gate and ABI fixture when changing the binding. The fixture establishes the tested call shape. Live Valve runtime compatibility is a separate check. [Fixture and reproduction commands](../Steam%20IDLE%20Progress.md)
