/**
 * IOManager - Manages process input/output operations
 *
 * Responsibilities:
 * - Manage stdin input
 * - Manage stdout/stderr output
 * - Handle binary data
 * - Implement EOF signaling
 */

import { ChildProcess } from "child_process";
import { IIOManager } from "../interfaces";
import { ProcessError, ManagedProcess } from "../types";

export class IOManager implements IIOManager {
  private childProcesses: Map<number, ChildProcess>;
  private processes: Map<number, ManagedProcess>;

  constructor(
    childProcesses: Map<number, ChildProcess>,
    processes: Map<number, ManagedProcess>
  ) {
    this.childProcesses = childProcesses;
    this.processes = processes;
  }

  /**
   * Write data to process stdin
   * @param pid Process ID
   * @param data Data to write (string or Buffer)
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Number of bytes written
   */
  async writeStdin(
    pid: number,
    data: string | Buffer,
    encoding: BufferEncoding = "utf-8"
  ): Promise<number> {
    const child = this.childProcesses.get(pid);
    const managed = this.processes.get(pid);

    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    if (!child) {
      throw new ProcessError(
        "Child process not available",
        "CHILD_PROCESS_NOT_FOUND"
      );
    }

    if (!child.stdin) {
      throw new ProcessError(
        "Process stdin not available",
        "STDIN_NOT_AVAILABLE"
      );
    }

    if (!child.stdin.writable) {
      throw new ProcessError(
        "Process stdin is not writable",
        "STDIN_NOT_WRITABLE"
      );
    }

    return new Promise((resolve, reject) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);

      const writeSuccess = child.stdin!.write(buffer, (error) => {
        if (error) {
          reject(
            new ProcessError(
              `Failed to write to stdin: ${error.message}`,
              "STDIN_WRITE_FAILED"
            )
          );
        } else {
          resolve(buffer.length);
        }
      });

      // If write returns false, the buffer is full
      if (!writeSuccess) {
        child.stdin!.once("drain", () => {
          resolve(buffer.length);
        });
      }
    });
  }

  /**
   * Close stdin stream for a process
   * @param pid Process ID
   */
  async closeStdin(pid: number): Promise<void> {
    const child = this.childProcesses.get(pid);
    const managed = this.processes.get(pid);

    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    if (!child) {
      throw new ProcessError(
        "Child process not available",
        "CHILD_PROCESS_NOT_FOUND"
      );
    }

    if (!child.stdin) {
      // Stdin already closed or not available
      return;
    }

    return new Promise((resolve, reject) => {
      child.stdin!.end((error?: Error) => {
        if (error) {
          reject(
            new ProcessError(
              `Failed to close stdin: ${error.message}`,
              "STDIN_CLOSE_FAILED"
            )
          );
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get buffered stdout output
   * @param pid Process ID
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Stdout content and byte count
   */
  getStdout(
    pid: number,
    encoding: BufferEncoding = "utf-8"
  ): { content: string; bytes: number } {
    const managed = this.processes.get(pid);

    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    const bytes = managed.outputBuffer.reduce(
      (sum, buf) => sum + buf.length,
      0
    );
    const content = Buffer.concat(managed.outputBuffer).toString(encoding);

    return { content, bytes };
  }

  /**
   * Get buffered stderr output
   * @param pid Process ID
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Stderr content and byte count
   */
  getStderr(
    pid: number,
    encoding: BufferEncoding = "utf-8"
  ): { content: string; bytes: number } {
    const managed = this.processes.get(pid);

    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    const bytes = managed.errorBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const content = Buffer.concat(managed.errorBuffer).toString(encoding);

    return { content, bytes };
  }

  /**
   * Get both stdout and stderr output
   * @param pid Process ID
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Both stdout and stderr with byte counts
   */
  getOutput(
    pid: number,
    encoding: BufferEncoding = "utf-8"
  ): {
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
  } {
    const managed = this.processes.get(pid);

    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    const stdoutBytes = managed.outputBuffer.reduce(
      (sum, buf) => sum + buf.length,
      0
    );
    const stderrBytes = managed.errorBuffer.reduce(
      (sum, buf) => sum + buf.length,
      0
    );

    const stdout = Buffer.concat(managed.outputBuffer).toString(encoding);
    const stderr = Buffer.concat(managed.errorBuffer).toString(encoding);

    return { stdout, stderr, stdoutBytes, stderrBytes };
  }

  /**
   * Clear output buffers for a process
   * @param pid Process ID
   */
  clearBuffers(pid: number): void {
    const managed = this.processes.get(pid);

    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    managed.outputBuffer = [];
    managed.errorBuffer = [];
  }
}
