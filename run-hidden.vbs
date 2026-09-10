Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir
WshShell.Run "cmd /c node server.js", 0, False
WScript.Sleep 2500
' נפתח ישירות ב"מענה היומי" - תמונת המצב של היום בהפעלת המחשב.
' משם כפתור "המשך ללוח הבקרה" מוביל לשאר המערכת.
WshShell.Run "http://localhost:4420/daily.html", 1, False
