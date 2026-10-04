const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const projectRoot = path.resolve(__dirname, "..")
const exportDirectory = path.join(projectRoot, "out")
const distDirectory = path.join(projectRoot, "dist")

function assertProjectChild(target, expectedName) {
  if (path.dirname(target) !== projectRoot || path.basename(target) !== expectedName) {
    throw new Error(`Ruta de salida no segura: ${target}`)
  }
}

assertProjectChild(exportDirectory, "out")
assertProjectChild(distDirectory, "dist")

fs.rmSync(exportDirectory, { recursive: true, force: true })
fs.rmSync(distDirectory, { recursive: true, force: true })

const nextCli = require.resolve("next/dist/bin/next")
const build = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    STATIC_EXPORT: "true",
  },
  stdio: "inherit",
})

if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)
if (!fs.existsSync(exportDirectory)) {
  throw new Error("Next.js no generó la carpeta out esperada.")
}

try {
  fs.renameSync(exportDirectory, distDirectory)
} catch (error) {
  // Windows can deny a directory rename while an antivirus or indexer scans
  // the newly exported files. A recursive copy safely handles that case.
  if (error.code !== "EPERM" && error.code !== "EXDEV") throw error
  fs.cpSync(exportDirectory, distDirectory, { recursive: true })
  fs.rmSync(exportDirectory, { recursive: true, force: true })
}
console.log(`\nDist generado: ${distDirectory}`)
