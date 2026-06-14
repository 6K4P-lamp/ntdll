// Extended NT Native API Cheatsheet
// Each entry: { signature, structures, notes }
// Exported to window.NT_CHEATSHEET for direct use in browser environments

window.NT_CHEATSHEET = new Map([

    // =========================
    // FILE / IO
    // =========================

    ["NtCreateFile", {
        signature: `NTSTATUS NtCreateFile(
            PHANDLE            FileHandle,
            ACCESS_MASK        DesiredAccess,
            POBJECT_ATTRIBUTES ObjectAttributes,
            PIO_STATUS_BLOCK   IoStatusBlock,
            PLARGE_INTEGER     AllocationSize,
            ULONG              FileAttributes,
            ULONG              ShareAccess,
            ULONG              CreateDisposition,
            ULONG              CreateOptions,
            PVOID              EaBuffer,
            ULONG              EaLength
        );`,
        structures: [
            "UNICODE_STRING — NT path string",
            "OBJECT_ATTRIBUTES — Initialized via InitializeObjectAttributes()",
                               "IO_STATUS_BLOCK — Receives completion status and information"
        ],
        notes: [
            "Use NT namespace paths such as \\\\??\\\\C:\\\\test.txt",
            "Returns NTSTATUS instead of Win32 error codes",
            "Close handles using NtClose()",
                               "Supports native-only flags unavailable in CreateFileW()"
        ]
    }],

    ["NtReadFile", {
        signature: `NTSTATUS NtReadFile(
            HANDLE           FileHandle,
            HANDLE           Event,
            PIO_APC_ROUTINE  ApcRoutine,
            PVOID            ApcContext,
            PIO_STATUS_BLOCK IoStatusBlock,
            PVOID            Buffer,
            ULONG            Length,
            PLARGE_INTEGER   ByteOffset,
            PULONG           Key
        );`,
        structures: [
            "IO_STATUS_BLOCK — Information contains bytes actually read"
        ],
        notes: [
            "Synchronous reads require synchronous file handle flags",
            "ByteOffset can be NULL for sequential synchronous IO",
            "Supports APC completion routines"
        ]
    }],

    ["NtWriteFile", {
        signature: `NTSTATUS NtWriteFile(
            HANDLE           FileHandle,
            HANDLE           Event,
            PIO_APC_ROUTINE  ApcRoutine,
            PVOID            ApcContext,
            PIO_STATUS_BLOCK IoStatusBlock,
            PVOID            Buffer,
            ULONG            Length,
            PLARGE_INTEGER   ByteOffset,
            PULONG           Key
        );`,
        structures: [
            "IO_STATUS_BLOCK — Information contains bytes actually written"
        ],
        notes: [
            "Requires FILE_WRITE_DATA or GENERIC_WRITE access",
            "Supports asynchronous completion",
            "Used internally by WriteFile()"
        ]
    }],

    ["NtDeleteFile", {
        signature: `NTSTATUS NtDeleteFile(
            POBJECT_ATTRIBUTES ObjectAttributes
        );`,
        structures: [
            "OBJECT_ATTRIBUTES — Contains NT path"
        ],
        notes: [
            "Deletes file directly via native API",
            "Path must use NT namespace",
            "No file handle required"
        ]
    }],

    ["NtQueryDirectoryFile", {
        signature: `NTSTATUS NtQueryDirectoryFile(
            HANDLE                 FileHandle,
            HANDLE                 Event,
            PIO_APC_ROUTINE        ApcRoutine,
            PVOID                  ApcContext,
            PIO_STATUS_BLOCK       IoStatusBlock,
            PVOID                  FileInformation,
            ULONG                  Length,
            FILE_INFORMATION_CLASS FileInformationClass,
            BOOLEAN                ReturnSingleEntry,
            PUNICODE_STRING        FileName,
            BOOLEAN                RestartScan
        );`,
        structures: [
            "FILE_DIRECTORY_INFORMATION",
            "FILE_BOTH_DIR_INFORMATION"
        ],
        notes: [
            "Used to enumerate directory contents",
            "Native equivalent of FindFirstFile/FindNextFile",
            "Can filter results using FileName"
        ]
    }],

    // =========================
    // MEMORY
    // =========================

    ["NtAllocateVirtualMemory", {
        signature: `NTSTATUS NtAllocateVirtualMemory(
            HANDLE    ProcessHandle,
            PVOID     *BaseAddress,
            ULONG_PTR ZeroBits,
            PSIZE_T   RegionSize,
            ULONG     AllocationType,
            ULONG     Protect
        );`,
        structures: [],
        notes: [
            "Native equivalent of VirtualAlloc()",
                               "Use NtCurrentProcess() for current process",
                               "Supports MEM_COMMIT and MEM_RESERVE"
        ]
    }],

    ["NtFreeVirtualMemory", {
        signature: `NTSTATUS NtFreeVirtualMemory(
            HANDLE  ProcessHandle,
            PVOID   *BaseAddress,
            PSIZE_T RegionSize,
            ULONG   FreeType
        );`,
        structures: [],
        notes: [
            "Equivalent of VirtualFree()",
                               "MEM_RELEASE requires RegionSize = 0",
                               "Can decommit without releasing address range"
        ]
    }],

    ["NtProtectVirtualMemory", {
        signature: `NTSTATUS NtProtectVirtualMemory(
            HANDLE  ProcessHandle,
            PVOID   *BaseAddress,
            PSIZE_T RegionSize,
            ULONG   NewProtect,
            PULONG  OldProtect
        );`,
        structures: [],
        notes: [
            "Equivalent of VirtualProtect()",
                               "Returns old protection flags",
                               "Commonly used in shellcode loaders"
        ]
    }],

    ["NtReadVirtualMemory", {
        signature: `NTSTATUS NtReadVirtualMemory(
            HANDLE ProcessHandle,
            PVOID  BaseAddress,
            PVOID  Buffer,
            SIZE_T NumberOfBytesToRead,
            PSIZE_T NumberOfBytesReaded
        );`,
        structures: [],
        notes: [
            "Equivalent of ReadProcessMemory()",
                               "Requires PROCESS_VM_READ access",
                               "Commonly used by debuggers and injectors"
        ]
    }],

    ["NtWriteVirtualMemory", {
        signature: `NTSTATUS NtWriteVirtualMemory(
            HANDLE ProcessHandle,
            PVOID  BaseAddress,
            PVOID  Buffer,
            SIZE_T NumberOfBytesToWrite,
            PSIZE_T NumberOfBytesWritten
        );`,
        structures: [],
        notes: [
            "Equivalent of WriteProcessMemory()",
                               "Requires PROCESS_VM_WRITE access",
                               "Often paired with NtCreateThreadEx"
        ]
    }],

    // =========================
    // PROCESS / THREAD
    // =========================

    ["NtOpenProcess", {
        signature: `NTSTATUS NtOpenProcess(
            PHANDLE            ProcessHandle,
            ACCESS_MASK        DesiredAccess,
            POBJECT_ATTRIBUTES ObjectAttributes,
            PCLIENT_ID         ClientId
        );`,
        structures: [
            "CLIENT_ID — Contains PID and TID",
            "OBJECT_ATTRIBUTES — Usually initialized empty"
        ],
        notes: [
            "Used instead of OpenProcess()",
                               "Requires PROCESS_* access flags",
                               "ClientId.UniqueProcess stores target PID"
        ]
    }],

    ["NtOpenThread", {
        signature: `NTSTATUS NtOpenThread(
            PHANDLE            ThreadHandle,
            ACCESS_MASK        DesiredAccess,
            POBJECT_ATTRIBUTES ObjectAttributes,
            PCLIENT_ID         ClientId
        );`,
        structures: [
            "CLIENT_ID",
            "OBJECT_ATTRIBUTES"
        ],
        notes: [
            "Native equivalent of OpenThread()",
                               "Can target remote threads",
                               "Requires THREAD_* permissions"
        ]
    }],

    ["NtTerminateProcess", {
        signature: `NTSTATUS NtTerminateProcess(
            HANDLE   ProcessHandle,
            NTSTATUS ExitStatus
        );`,
        structures: [],
        notes: [
            "Equivalent of TerminateProcess()",
                               "Passing NULL terminates current process",
                               "Forcefully stops execution"
        ]
    }],

    ["NtSuspendProcess", {
        signature: `NTSTATUS NtSuspendProcess(
            HANDLE ProcessHandle
        );`,
        structures: [],
        notes: [
            "Suspends all threads in target process",
            "Undocumented but widely used",
            "Requires PROCESS_SUSPEND_RESUME access"
        ]
    }],

    ["NtResumeProcess", {
        signature: `NTSTATUS NtResumeProcess(
            HANDLE ProcessHandle
        );`,
        structures: [],
        notes: [
            "Resumes all suspended threads",
            "Used together with NtSuspendProcess()"
        ]
    }],

    ["NtCreateThreadEx", {
        signature: `NTSTATUS NtCreateThreadEx(
            PHANDLE            ThreadHandle,
            ACCESS_MASK        DesiredAccess,
            POBJECT_ATTRIBUTES ObjectAttributes,
            HANDLE             ProcessHandle,
            PVOID              StartRoutine,
            PVOID              Argument,
            ULONG              CreateFlags,
            SIZE_T             ZeroBits,
            SIZE_T             StackSize,
            SIZE_T             MaximumStackSize,
            PVOID              AttributeList
        );`,
        structures: [],
        notes: [
            "Native thread creation API",
            "Frequently used for DLL injection",
            "Can create threads in remote processes"
        ]
    }],

    // =========================
    // SECTION / MAPPING
    // =========================

    ["NtCreateSection", {
        signature: `NTSTATUS NtCreateSection(
            PHANDLE            SectionHandle,
            ACCESS_MASK        DesiredAccess,
            POBJECT_ATTRIBUTES ObjectAttributes,
            PLARGE_INTEGER     MaximumSize,
            ULONG              SectionPageProtection,
            ULONG              AllocationAttributes,
            HANDLE             FileHandle
        );`,
        structures: [
            "OBJECT_ATTRIBUTES"
        ],
        notes: [
            "Creates memory-backed or file-backed sections",
            "SEC_IMAGE maps executable PE images",
            "Supports shared memory"
        ]
    }],

    ["NtMapViewOfSection", {
        signature: `NTSTATUS NtMapViewOfSection(
            HANDLE          SectionHandle,
            HANDLE          ProcessHandle,
            PVOID           *BaseAddress,
            ULONG_PTR       ZeroBits,
            SIZE_T          CommitSize,
            PLARGE_INTEGER  SectionOffset,
            PSIZE_T         ViewSize,
            SECTION_INHERIT InheritDisposition,
            ULONG           AllocationType,
            ULONG           Win32Protect
        );`,
        structures: [],
        notes: [
            "Maps section into process address space",
            "Can share memory across processes",
            "Equivalent to MapViewOfFile()"
        ]
    }],

    ["NtUnmapViewOfSection", {
        signature: `NTSTATUS NtUnmapViewOfSection(
            HANDLE ProcessHandle,
            PVOID  BaseAddress
        );`,
        structures: [],
        notes: [
            "Removes mapped section view",
            "Equivalent of UnmapViewOfFile()"
        ]
    }],

    // =========================
    // SYSTEM INFORMATION
    // =========================

    ["NtQuerySystemInformation", {
        signature: `NTSTATUS NtQuerySystemInformation(
            SYSTEM_INFORMATION_CLASS SystemInformationClass,
            PVOID                    SystemInformation,
            ULONG                    SystemInformationLength,
            PULONG                   ReturnLength
        );`,
        structures: [
            "SYSTEM_PROCESS_INFORMATION",
            "SYSTEM_MODULE_INFORMATION",
            "SYSTEM_BASIC_INFORMATION"
        ],
        notes: [
            "Retrieves low-level kernel/system information",
            "Often requires dynamic buffer resizing",
            "Frequently used in security research"
        ]
    }],

    ["NtQueryInformationProcess", {
        signature: `NTSTATUS NtQueryInformationProcess(
            HANDLE           ProcessHandle,
            PROCESSINFOCLASS ProcessInformationClass,
            PVOID            ProcessInformation,
            ULONG            ProcessInformationLength,
            PULONG           ReturnLength
        );`,
        structures: [
            "PROCESS_BASIC_INFORMATION"
        ],
        notes: [
            "Can retrieve PEB address",
            "Used in anti-debugging and introspection",
            "Some classes require elevated privileges"
        ]
    }],

    ["NtQueryInformationThread", {
        signature: `NTSTATUS NtQueryInformationThread(
            HANDLE          ThreadHandle,
            THREADINFOCLASS ThreadInformationClass,
            PVOID           ThreadInformation,
            ULONG           ThreadInformationLength,
            PULONG          ReturnLength
        );`,
        structures: [],
        notes: [
            "Retrieves thread metadata",
            "Can query TEB address",
            "Useful for debuggers"
        ]
    }],

    // =========================
    // SYNCHRONIZATION
    // =========================

    ["NtCreateEvent", {
        signature: `NTSTATUS NtCreateEvent(
            PHANDLE            EventHandle,
            ACCESS_MASK        DesiredAccess,
            POBJECT_ATTRIBUTES ObjectAttributes,
            EVENT_TYPE         EventType,
            BOOLEAN            InitialState
        );`,
        structures: [
            "OBJECT_ATTRIBUTES"
        ],
        notes: [
            "Creates notification or synchronization events",
            "Equivalent of CreateEvent()",
                               "Supports named kernel objects"
        ]
    }],

    ["NtWaitForSingleObject", {
        signature: `NTSTATUS NtWaitForSingleObject(
            HANDLE         Handle,
            BOOLEAN        Alertable,
            PLARGE_INTEGER Timeout
        );`,
        structures: [],
        notes: [
            "Equivalent of WaitForSingleObject()",
                               "Timeout uses 100ns intervals",
                               "Negative timeout values are relative"
        ]
    }],

    ["NtDelayExecution", {
        signature: `NTSTATUS NtDelayExecution(
            BOOLEAN        Alertable,
            PLARGE_INTEGER DelayInterval
        );`,
        structures: [],
        notes: [
            "Kernel-level sleep function",
            "Used instead of Sleep()",
                               "Interval uses 100ns units"
        ]
    }],

    // =========================
    // HANDLES / OBJECTS
    // =========================

    ["NtClose", {
        signature: `NTSTATUS NtClose(
            HANDLE Handle
        );`,
        structures: [],
        notes: [
            "Closes native object handles",
            "Equivalent of CloseHandle()",
                               "Required for all NT object cleanup"
        ]
    }],

    ["NtDuplicateObject", {
        signature: `NTSTATUS NtDuplicateObject(
            HANDLE      SourceProcessHandle,
            HANDLE      SourceHandle,
            HANDLE      TargetProcessHandle,
            PHANDLE     TargetHandle,
            ACCESS_MASK DesiredAccess,
            ULONG       HandleAttributes,
            ULONG       Options
        );`,
        structures: [],
        notes: [
            "Duplicates handles across processes",
            "Equivalent of DuplicateHandle()",
                               "Can inherit or reduce access rights"
        ]
    }],

    // =========================
    // DRIVER / DEVICE
    // =========================

    ["NtDeviceIoControlFile", {
        signature: `NTSTATUS NtDeviceIoControlFile(
            HANDLE           FileHandle,
            HANDLE           Event,
            PIO_APC_ROUTINE  ApcRoutine,
            PVOID            ApcContext,
            PIO_STATUS_BLOCK IoStatusBlock,
            ULONG            IoControlCode,
            PVOID            InputBuffer,
            ULONG            InputBufferLength,
            PVOID            OutputBuffer,
            ULONG            OutputBufferLength
        );`,
        structures: [
            "IO_STATUS_BLOCK"
        ],
        notes: [
            "Sends IOCTL requests to drivers",
            "Equivalent of DeviceIoControl()",
                               "Used for direct kernel-driver communication"
        ]
    }]

]);
