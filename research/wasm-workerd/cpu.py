#!/usr/bin/env python3
"""Read cumulative process CPU nanoseconds and RSS from macOS libproc."""
import ctypes, json, sys
class Usage(ctypes.Structure):
    _fields_ = [('uuid', ctypes.c_ubyte * 16)] + [(name, ctypes.c_uint64) for name in (
        'user_ticks system_ticks pkg_idle_wkups interrupt_wkups pageins wired_bytes rss_bytes footprint_bytes '
        'start_abstime exit_abstime child_user_ns child_system_ns child_pkg_idle_wkups '
        'child_interrupt_wkups child_pageins child_elapsed_abstime disk_read_bytes disk_write_bytes').split()]
u=Usage()
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
if lib.proc_pid_rusage(int(sys.argv[1]),2,ctypes.byref(u)) != 0:
    raise OSError(ctypes.get_errno(),'proc_pid_rusage failed')
class Timebase(ctypes.Structure):
    _fields_ = [('numer',ctypes.c_uint32),('denom',ctypes.c_uint32)]
t=Timebase()
ctypes.CDLL('/usr/lib/libSystem.B.dylib').mach_timebase_info(ctypes.byref(t))
result={name:getattr(u,name) for name in ('user_ticks','system_ticks','rss_bytes','footprint_bytes')}
result.update(user_ns=u.user_ticks*t.numer/t.denom,system_ns=u.system_ticks*t.numer/t.denom,timebase_numer=t.numer,timebase_denom=t.denom)
print(json.dumps(result))
