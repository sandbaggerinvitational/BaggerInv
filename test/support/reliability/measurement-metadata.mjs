import os from "node:os";
import { sql } from "./postgres17.mjs";

// Bounded local snapshots outside timed samples. These are counters/host
// conditions, not database CPU utilization, physical IOPS or peak headroom.
export function measurementResourceSnapshot(cluster, database) {
  return {
    observedAt: new Date().toISOString(),
    hostLoadAverage: os.loadavg(), hostFreeMemoryBytes: os.freemem(),
    database: JSON.parse(sql(cluster, database, `select jsonb_build_object(
      'sizeBytes',pg_database_size(current_database()),
      'backends',numbackends,'blocksRead',blks_read,'blocksHit',blks_hit,
      'temporaryBytes',temp_bytes,'deadlocks',deadlocks,
      'commits',xact_commit,'rollbacks',xact_rollback,
      'blockReadTimeMs',blk_read_time,'blockWriteTimeMs',blk_write_time,
      'statsReset',stats_reset,'trackIoTiming',current_setting('track_io_timing'))
      from pg_stat_database where datname=current_database()`, { role: "" })),
    limitations: ["Cumulative database counters can lag; no subtraction across databases.",
      "Block counters are PostgreSQL buffer activity, not physical storage IOPS.",
      "Host load and free memory include unrelated processes; no database CPU or peak memory claim.",
      "Zero I/O time with track_io_timing off means unavailable, not zero physical I/O."],
  };
}

// Local host and owned cluster only. No provider telemetry is inferred from it.
export function measurementEnvironment(cluster, database) {
  return {
    scope: "LOCAL_SOCKET_ONLY",
    databaseVersion: sql(cluster, database, "show server_version", { role: "" }),
    host: { platform: process.platform, architecture: process.arch,
      osRelease: os.release(), nodeVersion: process.version,
      cpuModel: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem() },
    databaseSettings: JSON.parse(sql(cluster, database, `select jsonb_build_object(
      'shared_buffers',current_setting('shared_buffers'),
      'work_mem',current_setting('work_mem'),
      'max_connections',current_setting('max_connections'),
      'fsync',current_setting('fsync'),
      'synchronous_commit',current_setting('synchronous_commit'),
      'jit',current_setting('jit'))`, { role: "" })),
    resourceUtilization: { cpu: null, memory: null, io: null, connections: null,
      status: "UNAVAILABLE_NOT_SAMPLED" },
    initialResourceSnapshot: measurementResourceSnapshot(cluster, database),
    limitations: ["Unshared local host was not guaranteed; unrelated host processes may introduce noise.",
      "This is not a Supabase compute tier or Production capacity measurement.",
      "ROLLBACK samples exclude durable COMMIT/fsync latency and live network transport."],
  };
}
