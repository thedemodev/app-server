import bunyan from "bunyan";
import bunyanMiddleware from "bunyan-middleware";
import express from "express";
import yargs from "yargs";

import getAppServerRouter from "../getAppServerRouter";
import addTrailingSlash from "../utils/addTrailingSlash";
import deprecate from "../utils/deprecate";
import removeTrailingSlash from "../utils/removeTrailingSlash";
import toAbsolute from "../utils/toAbsolute";

const logger = bunyan.createLogger({ name: "@staticdeploy/app-server" });

interface IArgv extends yargs.Arguments {
    root: string;
    fallbackResource: string;
    selector: string;
    configKeyPrefix: string;
    basePath: string;
    port: number;
}

const argv = yargs
    .usage("Usage: $0 <options>")
    .env("APP_SERVER")
    .option("root", {
        default: "build",
        describe: "Root directory to serve",
        type: "string"
    })
    .option("fallbackResource", {
        alias: "index",
        coerce: toAbsolute,
        default: "index.html",
        describe:
            "Fallback resource to serve when the requested path doesn't match any asset",
        type: "string"
    })
    .option("selector", {
        default: "script#app-config",
        describe: "Selector for the script element to inject config into",
        type: "string"
    })
    .option("configKeyPrefix", {
        default: "APP_CONFIG_",
        describe:
            "Prefix of the environment variables to use for configuration",
        type: "string"
    })
    .option("basePath", {
        alias: "baseUrl",
        coerce: basePath => toAbsolute(addTrailingSlash(basePath)),
        default: "/",
        describe: "Website base path",
        type: "string"
    })
    .option("port", {
        coerce: port => parseInt(port, 10),
        default: "3000",
        describe: "Port to listen on",
        type: "string"
    })
    .wrap(Math.min(120, yargs.terminalWidth()))
    .strict().argv as IArgv;

// Deprecate use of --index option
if (
    process.argv.find(arg => /^--index/.test(arg)) ||
    process.env.APP_SERVER_INDEX
) {
    deprecate("Option --index is deprecated, use --fallbackResource instead");
}
// Deprecate use of --baseUrl option
if (
    process.argv.find(arg => /^--baseUrl/.test(arg)) ||
    process.env.APP_SERVER_BASE_URL
) {
    deprecate("Option --baseUrl is deprecated, use --basePath instead");
}

try {
    const app = express();
    app.set("strict routing", true);

    // Log requests
    app.use(bunyanMiddleware({ logger }));

    // If basePath !== /, redirect /basePath to /basePath/
    if (argv.basePath !== "/") {
        app.get(removeTrailingSlash(argv.basePath), (_req, res) => {
            res.redirect(301, argv.basePath);
        });
    }

    // Use appServerRouter
    app.use(
        argv.basePath,
        getAppServerRouter({
            root: argv.root,
            fallbackResource: argv.fallbackResource,
            selector: argv.selector,
            config: process.env,
            configKeyPrefix: argv.configKeyPrefix
        })
    );

    // Start the server
    app.listen(argv.port, () => {
        logger.info(`app-server started on port ${argv.port}`);
    });
} catch (err) {
    logger.error(err, "Error starting app-server");
    process.exit(1);
}
