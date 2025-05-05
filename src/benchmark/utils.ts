import { performance } from 'node:perf_hooks';

const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

export const runWithResourceUsage = async (label: string, fn: () => Promise<void>) => {
    console.log(`\nRunning benchmark: ${label}`);
    console.log(`-------------------------------`);

    // Start measurements
    const startCpu = process.cpuUsage();
    const startMem = process.memoryUsage();
    const start = performance.now();

    // Run the provided function
    await fn();

    // End measurements
    const end = performance.now();
    const endCpu = process.cpuUsage();
    const endMem = process.memoryUsage();

    // Calculate CPU usage (microseconds to milliseconds)
    const userCpuMs = (endCpu.user - startCpu.user) / 1000;
    const systemCpuMs = (endCpu.system - startCpu.system) / 1000;
    const totalCpuMs = userCpuMs + systemCpuMs;

    // Calculate RAM usage difference
    const ramUsedDiff = endMem.heapUsed - startMem.heapUsed;
    const ramUsedTotal = endMem.heapUsed;

    // Print results
    console.log(`Validation time  : ${(end - start).toFixed(2)} ms`);
    console.log(`CPU time (user)  : ${userCpuMs.toFixed(2)} ms`);
    console.log(`CPU time (system): ${systemCpuMs.toFixed(2)} ms`);
    console.log(`Total CPU time   : ${totalCpuMs.toFixed(2)} ms`);
    console.log(`RAM used (diff)  : ${formatBytes(ramUsedDiff)}`);
    console.log(`RAM used (total) : ${formatBytes(ramUsedTotal)}`);
    console.log(`-------------------------------\n`);
};
