// Stanje varnostnih kopij v Proxmoxu: nastavljena opravila in zadnji zagon.
import { pveGet } from "./proxmox";

export type BackupStatus = { jobs: number; enabledJobs: number; lastAt: number | null; lastOk: boolean | null };
const NODE = process.env.PVE_NODE ?? "pve";

export async function getBackupStatus(): Promise<BackupStatus> {
  const [jobs, tasks] = await Promise.all([
    pveGet<{ enabled?: number }[]>("/cluster/backup"),
    pveGet<{ endtime?: number; starttime: number; status?: string }[]>(`/nodes/${NODE}/tasks?typefilter=vzdump&limit=5`),
  ]);
  const last = tasks.find((task) => task.endtime);
  return {
    jobs: jobs.length,
    enabledJobs: jobs.filter((job) => job.enabled !== 0).length,
    lastAt: last?.endtime ?? null,
    lastOk: last ? last.status === "OK" : null,
  };
}
