/**
 * Interface for I/O management operations
 */

import { ChildProcess } from "child_process";

/**
 * I/O Manager interface for managing process input/output
 */
export interface IIOManager {
  /**
   * Write data to process stdin
   * @param pid Process ID
   * @param data Data to write
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Number of bytes written
   */
  writeStdin(
    pid: number,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<number>;

  /**
   * Close stdin stream for a process
   * @param pid Process ID
   */
  closeStdin(pid: number): Promise<void>;

  /**
   * Get buffered stdout output
   * @param pid Process ID
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Stdout content and byte count
   */
  getStdout(
    pid: number,
    encoding?: BufferEncoding
  ): { content: string; bytes: number };

  /**
   * Get buffered stderr output
   * @param pid Process ID
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Stderr content and byte count
   */
  getStderr(
    pid: number,
    encoding?: BufferEncoding
  ): { content: string; bytes: number };

  /**
   * Get both stdout and stderr output
   * @param pid Process ID
   * @param encoding Text encoding (default: 'utf-8')
   * @returns Both stdout and stderr with byte counts
   */
  getOutput(
    pid: number,
    encoding?: BufferEncoding
  ): {
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
  };

  /**
   * Clear output buffers for a process
   * @param pid Process ID
   */
  clearBuffers(pid: number): void;
}
