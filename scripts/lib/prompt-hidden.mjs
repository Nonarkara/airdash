// Read one line from the terminal without echoing it (piped stdin: read plainly).
// Secrets typed here never land in shell history or `ps` output.
export function promptHidden(label) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    stdout.write(label)
    if (!stdin.isTTY) { // piped: read it plainly
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', (d) => { buf += d })
      stdin.on('end', () => resolve(buf.split('\n')[0]))
      return
    }
    let buf = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData)
          stdout.write('\n'); resolve(buf); return
        }
        if (c === '\u0003') { stdout.write('\n'); process.exit(130) } // Ctrl-C
        if (c === '\u007f' || c === '\b') { if (buf) { buf = buf.slice(0, -1); stdout.write('\b \b') } continue }
        buf += c
        stdout.write('*')
      }
    }
    stdin.on('data', onData)
  })
}
