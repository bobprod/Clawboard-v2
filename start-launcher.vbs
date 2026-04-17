' ClawBoard Launcher — lance sans fenetre CMD visible
' Double-clic sur ce fichier (ou sur le raccourci Bureau) pour demarrer.

Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c node launcher.mjs", 0, False
