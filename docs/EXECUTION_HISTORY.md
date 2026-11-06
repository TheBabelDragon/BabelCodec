# Execution History

Rewind/replay use **full machine state blobs**, not cosmetic trace entries.

1. `ExecutionHistory.record()` after load/clock captures registers, memories, buses, controller.
2. **Step back** restores the previous blob.
3. History is bounded (`maxFrames`, default 512).
4. `exportJSON()` sets `replayCapable: true`.
