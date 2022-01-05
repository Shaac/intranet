import _ from "lodash"
import bcrypt from "bcrypt"
import sgMail from "@sendgrid/mail"

import ExpressAccessors, { RequestBody } from "./expressAccessors"
import { Volunteer, VolunteerWithoutId, translationVolunteer } from "../../services/volunteers"
import { canonicalEmail } from "../../utils/standardization"
import { getJwt } from "../secure"

const expressAccessor = new ExpressAccessors<VolunteerWithoutId, Volunteer>(
    "Volunteers",
    new Volunteer(),
    translationVolunteer
)

export const volunteerListGet = expressAccessor.listGet()
export const volunteerGet = expressAccessor.get()
export const volunteerAdd = expressAccessor.add()
export const volunteerSet = expressAccessor.set()

export const volunteerLogin = expressAccessor.get(async (list: Volunteer[], body: RequestBody) => {
    const volunteer = getByEmail(list, body.email)
    if (!volunteer) {
        throw Error("Il n'y a aucun bénévole avec cet email")
    }

    const password = body.password || ""
    const password1Match = await bcrypt.compare(
        password,
        volunteer.password1.replace(/^\$2y/, "$2a")
    )
    if (!password1Match) {
        const password2Match = await bcrypt.compare(
            password,
            volunteer.password2.replace(/^\$2y/, "$2a")
        )
        if (!password2Match) {
            throw Error("Mauvais mot de passe pour cet email")
        }
    }

    const jwt = await getJwt(volunteer.email)

    return {
        firstname: volunteer.firstname,
        jwt,
    }
})

const lastForgot: { [id: string]: number } = {}
export const volunteerForgot = expressAccessor.set(async (list: Volunteer[], body: RequestBody) => {
    const volunteer = getByEmail(list, body.email)
    if (!volunteer) {
        throw Error("Il n'y a aucun bénévole avec cet email")
    }
    const newVolunteer = _.cloneDeep(volunteer)

    const now = +new Date()
    const timeSinceLastSent = now - lastForgot[volunteer.id]
    if (timeSinceLastSent < 2 * 60 * 1000) {
        throw Error(
            "Un email t'a déjà été envoyé avec un nouveau mot de passe. Es-tu sûr qu'il n'est pas dans tes spams ?"
        )
    }
    lastForgot[volunteer.id] = now

    const password = generatePassword()
    const passwordHash = await bcrypt.hash(password, 10)
    newVolunteer.password2 = passwordHash

    await sendForgetEmail(volunteer.email, password)

    return {
        toDatabase: newVolunteer,
        toCaller: {
            message: `Un nouveau mot de passe t'a été envoyé par email. Regarde bien dans tes spams, ils pourrait y être :/`,
        },
    }
})

function getByEmail(list: Volunteer[], rawEmail: string): Volunteer | undefined {
    const email = canonicalEmail(rawEmail || "")
    const volunteer = list.find((v) => canonicalEmail(v.email) === email)
    return volunteer
}

function generatePassword(): string {
    const s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array(16)
        .join()
        .split(",")
        .map(() => s.charAt(Math.floor(Math.random() * s.length)))
        .join("")
}

async function sendForgetEmail(email: string, password: string): Promise<void> {
    const apiKey = process.env.SENDGRID_API_KEY || ""
    if (__DEV__ || apiKey === "") {
        console.error(`Fake sending forget email to ${email} with password ${password}`)
    } else {
        sgMail.setApiKey(apiKey)
        const msg = {
            to: email,
            from: "contact@parisestludique.fr",
            subject: "Nouveau mot de passe pour le site de Paris est Ludique",
            text: `Voici le nouveau mot de passe : ${password}\nL'ancien fonctionne encore, si tu t'en rappelles.`,
            html: `Voici le nouveau mot de passe : <strong>${password}</strong><br />L'ancien fonctionne encore, si tu t'en rappelles.`,
        }
        await sgMail.send(msg)
    }
}
