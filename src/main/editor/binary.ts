/**
 * 判断一段内容是不是二进制，用来决定能不能用文本编辑器打开。
 *
 * 规则：含 NUL 字节直接判定为二进制；前 8KB 里控制字符超过 10% 也算二进制。
 * 制表、换行、回车、换页、退格这些正常文本里会出现的字符不计入。
 */
export function isBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return false

  const sample = buffer.subarray(0, 8192)
  if (sample.includes(0)) return true

  let control = 0
  for (const byte of sample) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0c || byte === 0x08) continue
    if (byte < 0x20 || byte === 0x7f) control += 1
  }

  return control / sample.length > 0.1
}
