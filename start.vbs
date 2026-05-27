' Launches Electron silently (no console window).
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projectDir
' Clear ELECTRON_RUN_AS_NODE for the child by running through cmd that resets it.
sh.Run "cmd /c set ""ELECTRON_RUN_AS_NODE="" && """ & projectDir & "\node_modules\electron\dist\electron.exe"" """ & projectDir & """", 0, False
