import { Command } from "jsr:@cliffy/command@1.0.0-rc.7"
import { paths } from "./core/paths.ts"
import { desktopUrl, loadConfig } from "./core/config.ts"
import { version } from "./self.ts"
import { serve } from "./server/server.ts"
import { install, openBrowser, uninstall } from "./cli/install.ts"
import { serviceInstalled, serviceName, waitForHealth } from "./cli/service.ts"
import { inspectCheckout } from "./dimos/checkout.ts"

const installCommand = new Command()
    .description("Install Desktop as a service, then install dimos (the default when not installed yet).")
    .option("-y, --yes", "Don't ask; take the defaults.")
    .option("--no-open", "Don't open the browser at the end.")
    .option("--port <port:integer>", "Port for the web UI.")
    .option("--dimos-dir <dir:string>", "Use (or install to) this dimos checkout. Default: ~/.dimos/dimos")
    .option("--dimos-version <version:string>", "dimos tag or branch to install, e.g. v0.0.14 or main.")
    .option("--skip-dimos", "Only install Desktop.")
    .option("--dimos-install-arg <arg:string>", "Extra argument for dimos's scripts/install.sh.", { collect: true })
    .action(async (options) => {
        await install({
            yes: options.yes ?? false,
            open: options.open,
            port: options.port,
            dimosDir: options.dimosDir,
            dimosVersion: options.dimosVersion,
            skipDimos: options.skipDimos ?? false,
            dimosInstallArgs: options.dimosInstallArg ?? [],
        })
    })

const uninstallCommand = new Command()
    .description("Stop and remove the Desktop service and its files.")
    .option("-y, --yes", "Don't ask.")
    .option("--remove-dimos", "Also delete the dimos checkout.")
    .option("--keep-dimos", "Keep the dimos checkout without asking.")
    .action(async (options) => {
        await uninstall({
            yes: options.yes ?? false,
            removeDimos: options.removeDimos ? true : options.keepDimos ? false : undefined,
        })
    })

await new Command()
    .name("dimos-desktop")
    .version(version)
    .description("dimOS Desktop: install dimos, run blueprints, watch logs, and use apps from the browser.")
    .option("--uninstall", "Same as the uninstall command.", { standalone: true })
    .action(async (options) => {
        if (options.uninstall) {
            await uninstall({ yes: false })
            return
        }
        if (!serviceInstalled()) {
            await installCommand.parse(Deno.args)
            return
        }
        const url = desktopUrl()
        console.log(`Desktop is installed (${paths.root}), at ${url}`)
        await openBrowser(url)
    })
    .command("install", installCommand)
    .command("uninstall", uninstallCommand)
    .command("serve", "Run the server in the foreground (what the service runs).")
    .option("--port <port:integer>", "Port.")
    .option("--host <host:string>", "Host to bind. Default 127.0.0.1.")
    .action(async (options) => {
        await serve({ port: options.port, host: options.host })
    })
    .command("status", "Show whether Desktop and dimos are installed and running.")
    .action(async () => {
        const config = loadConfig()
        const up = await waitForHealth(desktopUrl(config), 1500)
        const dimos = await inspectCheckout(config.dimosDir)
        console.log(
            `service:  ${serviceInstalled() ? `installed (${serviceName})` : "not installed"}, ${
                up ? "running" : "not answering"
            }`,
        )
        console.log(`url:      ${desktopUrl(config)}`)
        console.log(
            `dimos:    ${
                dimos.installed
                    ? `${dimos.provider.version} at ${dimos.dir} (${dimos.ref})`
                    : `not installed at ${dimos.dir}`
            }`,
        )
        for (const problem of dimos.compat.problems) {
            console.log(`          incompatible: ${problem}`)
        }
    })
    .parse(Deno.args)
