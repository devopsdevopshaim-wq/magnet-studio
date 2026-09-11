Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

' מעלים את Docker Desktop ברקע (בשביל DevOps/n8n) — לא חוסם, לא נכשל אם אין Docker מותקן.
' בודקים אם כבר רץ (Docker Desktop.exe בתהליכים) לפני שמנסים לפתוח שוב.
On Error Resume Next
DockerRunning = False
Set Processes = GetObject("winmgmts:").ExecQuery("SELECT Name FROM Win32_Process WHERE Name='Docker Desktop.exe'")
For Each p In Processes
  DockerRunning = True
Next
If Not DockerRunning Then
  DockerPaths = Array( _
    WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Docker\Docker\Docker Desktop.exe", _
    WshShell.ExpandEnvironmentStrings("%LocalAppData%") & "\Docker\Docker Desktop.exe")
  For Each dp In DockerPaths
    If FSO.FileExists(dp) Then
      WshShell.Run """" & dp & """", 0, False
      Exit For
    End If
  Next
End If
On Error Goto 0

WshShell.Run "cmd /c node server.js", 0, False
WScript.Sleep 2500
' נפתח ישירות ב"מענה היומי" - תמונת המצב של היום בהפעלת המחשב.
' משם כפתור "המשך ללוח הבקרה" מוביל לשאר המערכת.
WshShell.Run "http://localhost:4420/daily.html", 1, False
