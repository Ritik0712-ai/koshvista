import { useState, useEffect, useRef } from "react";
import type { Workspace } from "../../shared/types";
import { encrypt } from "./backup";
import { request } from "./auth";
export function useBackup(
  w: Workspace,
  owner: string,
  demo: boolean,
  refresh: () => Promise<void>,
  notify: (s: string) => void,
) {
  const [pass, setPass] = useState(""),
    [auto, setAuto] = useState(false),
    [backupError, setBackupError] = useState("");
  const last = useRef("");
  const fingerprint = JSON.stringify({
    ...w,
    revision: undefined,
    profile: { ...w.profile, backup_verified_at: null },
  });
  useEffect(() => {
    if (!auto || !pass || !owner || fingerprint === last.current) return;
    const timer = setTimeout(async () => {
      try {
        const { driveBackup } = await import("./drive");
        await driveBackup(
          await encrypt(
            {
              version: 1,
              owner,
              created_at: new Date().toISOString(),
              data: JSON.parse(fingerprint),
            },
            pass,
          ),
          false,
        );
        last.current = fingerprint;
        if (!demo) await request("/backup/verified", "POST");
        await refresh();
        notify("Automatic Drive backup verified.");
        setBackupError("");
      } catch (e) {
        setBackupError((e as Error).message);
        setAuto(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [auto, pass, fingerprint, owner]);
  return { pass, setPass, auto, setAuto, backupError };
}
export type BackupControls = ReturnType<typeof useBackup>;
