import path from "path"
import express, { RequestHandler, Request, Response, NextFunction } from "express"
import logger from "morgan"
import cookieParser from "cookie-parser"
import compression from "compression"
import helmet from "helmet"
import hpp from "hpp"
import favicon from "serve-favicon"
import chalk from "chalk"
import * as http from "http"
import * as https from "https"
import * as fs from "fs"
import _ from "lodash"

import devServer from "./devServer"
import ssr from "./ssr"

import certbotRouter from "../routes/certbot"
import { hasSecret, secure } from "./secure"
import { announcementListGet } from "./gsheets/announcements"
import { detailedBoxListGet } from "./gsheets/boxes"
import {
    gameListGet,
    gameDetailsUpdate,
    gameWithVolunteersListGet,
    gamesToGiveListGet,
    gameTitleOrderCategories,
} from "./gsheets/games"
import { postulantAdd } from "./gsheets/postulants"
import { teamListGet } from "./gsheets/teams"
import {
    volunteerAsksSet,
    volunteerDayWishesSet,
    volunteerForgot,
    volunteerHostingSet,
    volunteerMealsSet,
    volunteerDiscordId,
    volunteerLogin,
    volunteerParticipationDetailsSet,
    volunteerPersonalInfoSet,
    volunteerSet,
    volunteerTeamWishesSet,
    volunteerTeamAssignSet,
    volunteerListGet,
    volunteerKnowledgeSet,
    volunteerAddNew,
    volunteerDetailedKnowledgeList,
    volunteerLoanSet,
} from "./gsheets/volunteers"
import { wishListGet, wishAdd } from "./gsheets/wishes"
import config from "../config"
import { notificationsSubscribe, notificationMain } from "./notifications"
import { /* discordRegisterCommands, */ discordBot, hasDiscordAccess } from "./discordBot"
import checkAccess from "./checkAccess"
import { hasGSheetsAccess } from "./gsheets/accessors"
import { addStatus, showStatusAt } from "./status"
import {
    miscDiscordInvitation,
    miscFestivalDateListGet,
    miscMeetingDateListGet,
} from "./gsheets/miscs"
import { retexSet } from "./gsheets/retex"

checkAccess()

notificationMain()

// discordRegisterCommands()
discordBot()

const app = express()

// Allow receiving big images
app.use(express.json({ limit: "200mb" }))
app.use(express.urlencoded({ limit: "200mb" }))

// Use helmet to secure Express with various HTTP headers
app.use(helmet({ contentSecurityPolicy: false }))
// Prevent HTTP parameter pollution
app.use(hpp())
// Compress all requests
app.use(compression())
// Https with certbot and Let's Encrypt
if (!__DEV__) {
    app.use("/.well-known/acme-challenge", certbotRouter)
}

// Use for http request debug (show errors only)
app.use(logger("dev", { skip: (_req, res) => res.statusCode < 400 }))
app.use(favicon(path.resolve(process.cwd(), "public/favicon.ico")))
app.use(express.static(path.resolve(process.cwd(), "public")))

// Enable dev-server in development
if (__DEV__) devServer(app)

app.use(express.json())
app.use(cookieParser())

// Anonymized DB download
app.get(
    "/OUpere3yzML8da8abw5Tyeef2P0LJOetmdDHfKZC0T2CU/dbAnonymized.json",
    async (_request: Request, response: Response, _next: NextFunction): Promise<void> => {
        const file = path.resolve(`access/dbAnonymized.json`)
        response.download(file)
    }
)

/**
 * APIs
 */
// Google Sheets API
app.get("/GameDetailsUpdate", gameDetailsUpdate)
app.get("/BoxDetailedListGet", detailedBoxListGet)
app.get("/GameListGet", gameListGet)
app.get("/GamesToGiveListGet", gamesToGiveListGet)
app.get("/GameTitleOrderCategories", gameTitleOrderCategories)
app.get("/MiscFestivalDateListGet", miscFestivalDateListGet)
app.get("/MiscMeetingDateListGet", miscMeetingDateListGet)
app.get("/WishListGet", wishListGet)
app.post("/WishAdd", wishAdd)
app.post("/PostulantAdd", postulantAdd)
// Disabling registration app.post("/VolunteerPartialAdd", volunteerPartialAdd)
app.post("/VolunteerLogin", volunteerLogin)
app.post("/VolunteerForgot", volunteerForgot)
app.get("/VolunteerListGet", secure as RequestHandler, volunteerListGet)

// Secured APIs
app.get("/AnnouncementListGet", secure as RequestHandler, announcementListGet)
app.get("/GameWithVolunteersListGet", secure as RequestHandler, gameWithVolunteersListGet)
app.get("/MiscDiscordInvitationGet", secure as RequestHandler, miscDiscordInvitation)
app.post("/RetexSet", secure as RequestHandler, retexSet)
app.get("/TeamListGet", teamListGet)
app.get("/VolunteerDiscordId", secure as RequestHandler, volunteerDiscordId)
app.post("/VolunteerAsksSet", secure as RequestHandler, volunteerAsksSet)
app.post("/VolunteerKnowledgeSet", secure as RequestHandler, volunteerKnowledgeSet)
app.post(
    "/VolunteerDetailedKnowledgeListGet",
    secure as RequestHandler,
    volunteerDetailedKnowledgeList
)
app.post("/VolunteerLoanSet", secure as RequestHandler, volunteerLoanSet)
app.post(
    "/VolunteerParticipationDetailsSet",
    secure as RequestHandler,
    volunteerParticipationDetailsSet
)
app.post("/VolunteerDayWishesSet", secure as RequestHandler, volunteerDayWishesSet)
app.post("/VolunteerHostingSet", secure as RequestHandler, volunteerHostingSet)
app.post("/VolunteerMealsSet", secure as RequestHandler, volunteerMealsSet)
app.post("/VolunteerPersonalInfoSet", secure as RequestHandler, volunteerPersonalInfoSet)
app.post("/VolunteerTeamWishesSet", secure as RequestHandler, volunteerTeamWishesSet)
app.post("/VolunteerTeamAssignSet", secure as RequestHandler, volunteerTeamAssignSet)

// Admin only
app.post("/VolunteerAddNew", secure as RequestHandler, volunteerAddNew)
app.post("/VolunteerSet", secure as RequestHandler, volunteerSet)

// Push notification subscription
app.post("/notifications/subscribe", notificationsSubscribe)

// Use React server-side rendering middleware
app.get("*", ssr)

/**
 * Create HTTP and HTTPS server.
 */

const servers = [{ protocol: "http", server: http.createServer(app) }]

interface Cert {
    key: string
    cert: string
}
const certPaths: Cert[] = [
    {
        // Prod
        key: "/root/certbot/config/live/fo.parisestludique.fr/privkey.pem",
        cert: "/root/certbot/config/live/fo.parisestludique.fr/fullchain.pem",
    },
    {
        // Local
        key: "../certbot/key.pem",
        cert: "../certbot/cert.pem",
    },
]
const validCertPath: Cert | undefined = certPaths.find((certPath: Cert) =>
    _.every(certPath, (pemPath: string) => fs.existsSync(pemPath))
)
if (validCertPath) {
    const httpsOptions = _.mapValues(validCertPath, (pemPath: string) => fs.readFileSync(pemPath))

    servers.push({ protocol: "https", server: https.createServer(httpsOptions, app) })

    showStatusAt(6)
} else {
    showStatusAt(5)
}

/**
 * Listen on provided port, on all network interfaces.
 */
servers.forEach(({ protocol, server }) => {
    server.listen(protocol === "http" ? config.PORT : <number>config.PORT + 2)
    server.on("error", onError)
    server.on("listening", () => onListening(server))
})

/**
 * Event listener for HTTP server 'error' event.
 */

function onError(error: any) {
    if (error) {
        addStatus("Server listening:", chalk.red(`==> 😭  OMG!!! ${error}`))
    }
}

/**
 * Event listener for HTTP server 'listening' event.
 */

function onListening(server: any) {
    const addr = server.address()
    const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr.port}`
    addStatus("Server listening:", chalk.green(`✅ ${bind}`))
}

hasGSheetsAccess().then((hasApiAccess: boolean) => {
    if (hasApiAccess) {
        addStatus("Database:", chalk.green(`✅ online from Google Sheet`))
    } else {
        addStatus("Database:", chalk.blue(`🚧 offline, simulated from local db file`))
    }
})

const hasSendGridApiAccess = !!process.env.SENDGRID_API_KEY
if (hasSendGridApiAccess) {
    addStatus("Emailing:", chalk.green(`✅ online through SendGrid`))
} else {
    addStatus("Emailing:", chalk.blue(`🚧 offline, simulated`))
}

const hasPushNotifAccess = !!process.env.FORCE_ORANGE_PUBLIC_VAPID_KEY
if (hasPushNotifAccess) {
    addStatus("Push notif:", chalk.green(`✅ online with a Vapid key`))
} else {
    addStatus("Push notif:", chalk.blue(`🚧 offline, simulated`))
}

hasDiscordAccess().then((hasApiAccess: boolean) => {
    if (hasApiAccess) {
        addStatus("Discord bot:", chalk.green(`✅ online through discord.js`))
    } else {
        addStatus("Discord bot:", chalk.blue(`🚧 no creds, disabled`))
    }
})

hasSecret().then((has: boolean) => {
    if (has) {
        addStatus("JWT secret:", chalk.green(`✅ prod private one from file`))
    } else {
        addStatus("JWT secret:", chalk.blue(`🚧 dev public fake one from config`))
    }
})
