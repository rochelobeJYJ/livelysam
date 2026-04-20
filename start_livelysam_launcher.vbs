Option Explicit

Dim shell, fso, rootPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
rootPath = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = rootPath

Dim launchType, launchCommand, windowStyle
launchType = ""
launchCommand = ""
windowStyle = 1

ResolveLaunchTarget rootPath, launchType, launchCommand, windowStyle

If WScript.Arguments.Count > 0 Then
  Dim firstArg
  firstArg = LCase(Trim(CStr(WScript.Arguments(0))))
  If firstArg = "/dry-run" Then
    If Len(launchCommand) > 0 Then
      WScript.Echo launchType & ":" & launchCommand
      WScript.Quit 0
    End If

    WScript.Echo "error:launcher target not found"
    WScript.Quit 1
  End If
End If

If Len(launchCommand) = 0 Then
  MsgBox "LivelySam launcher target was not found." & vbCrLf & vbCrLf & _
    "Checked paths:" & vbCrLf & _
    fso.BuildPath(rootPath, "LivelySamLauncher.exe") & vbCrLf & _
    fso.BuildPath(rootPath, "dist\launcher\LivelySamLauncher.exe") & vbCrLf & _
    fso.BuildPath(rootPath, "venv\Scripts\pythonw.exe"), _
    vbExclamation, "LivelySam"
  WScript.Quit 1
End If

shell.Run launchCommand, windowStyle, False
WScript.Quit 0

Sub ResolveLaunchTarget(basePath, ByRef outType, ByRef outCommand, ByRef outWindowStyle)
  Dim rootExe, distExe, pythonwExe, pythonExe, scriptPath

  rootExe = fso.BuildPath(basePath, "LivelySamLauncher.exe")
  distExe = fso.BuildPath(basePath, "dist\launcher\LivelySamLauncher.exe")
  pythonwExe = fso.BuildPath(basePath, "venv\Scripts\pythonw.exe")
  pythonExe = fso.BuildPath(basePath, "venv\Scripts\python.exe")
  scriptPath = fso.BuildPath(basePath, "tools\livelysam_launcher_compact.py")

  If fso.FileExists(distExe) Then
    outType = "exe"
    outCommand = Quote(distExe)
    outWindowStyle = 1
    Exit Sub
  End If

  If fso.FileExists(rootExe) Then
    outType = "exe"
    outCommand = Quote(rootExe)
    outWindowStyle = 1
    Exit Sub
  End If

  If fso.FileExists(pythonwExe) And fso.FileExists(scriptPath) Then
    outType = "pythonw"
    outCommand = Quote(pythonwExe) & " " & Quote(scriptPath)
    outWindowStyle = 1
    Exit Sub
  End If

  If fso.FileExists(pythonExe) And fso.FileExists(scriptPath) Then
    outType = "python"
    outCommand = Quote(pythonExe) & " " & Quote(scriptPath)
    outWindowStyle = 0
  End If
End Sub

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
