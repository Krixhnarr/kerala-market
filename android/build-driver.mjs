// Drives @bubblewrap/core directly (createTwaProject + gradle build) instead
// of the bubblewrap CLI, whose interactive prompts don't work reliably over
// piped stdin in this environment. Run from android/ with:
//   node build-driver.mjs
import { TwaManifest, TwaGenerator, Config, JdkHelper, AndroidSdkTools, ConsoleLog } from "@bubblewrap/core";
import path from "node:path";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

const projectDir = process.cwd();
const log = new ConsoleLog("build-driver");

const config = new Config(process.env.JAVA_HOME, process.env.ANDROID_HOME);
const jdkHelper = new JdkHelper(process, config);
const androidSdkTools = await AndroidSdkTools.create(process, config, jdkHelper, log);

const manifest = await TwaManifest.fromFile(path.join(projectDir, "twa-manifest.json"));
log.info(`Loaded manifest for ${manifest.packageId} -> ${manifest.host}`);

const generator = new TwaGenerator();
await generator.createTwaProject(projectDir, manifest, log);
log.info("Android project generated.");

// GradleWrapper in @bubblewrap/core spawns the bare relative name "gradlew.bat"
// with shell:true, which cmd.exe on this machine doesn't resolve against cwd
// reliably. Invoke the absolute path directly instead - same env, same effect.
const env = androidSdkTools.getEnv();
const gradlewPath = path.join(projectDir, "gradlew.bat");
async function runGradle(task) {
  log.info(`Running gradle ${task} --stacktrace ...`);
  const { stdout, stderr } = await execFileP(gradlewPath, [task, "--stacktrace"], { env, cwd: projectDir, shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}
await runGradle("assembleRelease");
await runGradle("bundleRelease");

// Same post-processing as `bubblewrap build`'s CLI (lib/cmds/build.js):
// Gradle's own output APK/AAB are not the final signed artifacts - align +
// apksigner for the APK, jarsigner for the AAB (different signing schemes).
const ksPass = `"${process.env.BUBBLEWRAP_KEYSTORE_PASSWORD}"`;
const keyPass = `"${process.env.BUBBLEWRAP_KEY_PASSWORD}"`;

const apkUnsigned = path.join(projectDir, "app/build/outputs/apk/release/app-release-unsigned.apk");
const apkAligned = path.join(projectDir, "app-release-unsigned-aligned.apk");
const apkSigned = path.join(projectDir, "app-release-signed.apk");
log.info("Verifying APK zip alignment...");
await androidSdkTools.zipalignOnlyVerification(apkUnsigned);
fs.copyFileSync(apkUnsigned, apkAligned);
log.info("Signing APK with apksigner...");
await androidSdkTools.apksigner(manifest.signingKey.path, ksPass, manifest.signingKey.alias, keyPass, apkAligned, apkSigned);

const aabUnsigned = path.join(projectDir, "app/build/outputs/bundle/release/app-release.aab");
const aabSigned = path.join(projectDir, "app-release-bundle.aab");
log.info("Signing App Bundle with jarsigner...");
// JarSigner from @bubblewrap/core relies on jdkHelper.getEnv() prepending the
// JDK bin dir to PATH, which doesn't take effect for this spawned process on
// this machine (same class of issue as the gradlew.bat path resolution
// above) - call the jarsigner binary by its absolute path instead.
const jarsignerPath = path.join(process.env.JAVA_HOME, "bin", "jarsigner.exe");
await execFileP(jarsignerPath, [
  "-verbose", "-sigalg", "SHA256withRSA", "-digestalg", "SHA-256",
  "-keystore", manifest.signingKey.path, aabUnsigned, manifest.signingKey.alias,
  "-storepass", ksPass, "-keypass", keyPass, "-signedjar", aabSigned,
], { env, cwd: projectDir, shell: true, maxBuffer: 64 * 1024 * 1024 }).then(
  ({ stdout, stderr }) => { if (stdout) process.stdout.write(stdout); if (stderr) process.stderr.write(stderr); }
);

log.info(`Build complete: ${apkSigned}, ${aabSigned}`);
