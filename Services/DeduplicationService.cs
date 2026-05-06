using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

public interface IDeduplicationService
{
    Task<T> RunOnceAsync<T>(string key, Func<Task<T>> taskFactory);
}

public class DeduplicationService : IDeduplicationService
{
    private readonly ConcurrentDictionary<string, Task> _activeTasks = new();
    private readonly ILogger<DeduplicationService> _logger;

    public DeduplicationService(ILogger<DeduplicationService> logger)
    {
        _logger = logger;
    }

    public async Task<T> RunOnceAsync<T>(string key, Func<Task<T>> taskFactory)
    {
        while (true)
        {
            if (_activeTasks.TryGetValue(key, out var existingTask))
            {
                // 1. DEDUP TASK LIFECYCLE FIX (Retry Safety)
                // NEVER reuse a failed or cancelled task.
                if (existingTask.IsFaulted || existingTask.IsCanceled)
                {
                    _logger.LogWarning("DEDUP_CLEANUP | Removing failed/cancelled task from registry for key: {Key}", key);
                    _activeTasks.TryRemove(key, out _);
                    continue; // Loop again to create/get a fresh task
                }

                _logger.LogInformation("DEDUP_HIT | Waiting for existing task: {Key}", key);
                try 
                {
                    return await (Task<T>)existingTask;
                }
                catch
                {
                    // If the task we were waiting for failed, we should probably let the caller handle it,
                    // but the next caller will trigger a fresh task because of the cleanup above.
                    throw;
                }
            }

            // Create a new completion source to manage the task lifecycle safely
            var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            if (_activeTasks.TryAdd(key, tcs.Task))
            {
                _logger.LogDebug("DEDUP_MISS | Starting new task for key: {Key}", key);
                try
                {
                    T result = await taskFactory();
                    tcs.SetResult(result);
                    return result;
                }
                catch (Exception ex)
                {
                    tcs.SetException(ex);
                    throw;
                }
                finally
                {
                    // 1. REQUIRED FIX: Always remove task from registry in finally block
                    _activeTasks.TryRemove(key, out _);
                }
            }
            // If TryAdd failed, another thread won. Loop again to try get their task.
        }
    }
}
