# 076: `set RC=!errorlevel! & ...` keeps a trailing space

**Symptom.** The installer's Node.js command ran `winget --scope user`, got exit code 0, and still ran the machine-wide retry (a UAC prompt for nothing). `check_installer.ps1` caught it with a fake winget: two calls instead of one.

**Cause.** In a one-line `cmd /v:on /c "... & set RC=!errorlevel! & if !RC! neq 0 (...)"`, everything up to `&` is the value, so `RC` is `"0 "`. Delayed expansion substitutes after tokenizing, so `if !RC! neq 0` compares the token `0 ` with `0` and is true.

**Fix.** Quote the assignment: `set "RC=!errorlevel!"` (in Inno Setup `Parameters`, `set ""RC=!errorlevel!""`). `exit /b !RC!` was not affected.
