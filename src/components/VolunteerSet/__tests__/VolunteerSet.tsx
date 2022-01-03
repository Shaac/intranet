/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

import VolunteerSet from "../index"

describe("<SetVolunteer />", () => {
    it("renders", () => {
        const dispatch = jest.fn()
        const tree = render(
            <MemoryRouter>
                <VolunteerSet
                    dispatch={dispatch}
                    volunteer={{
                        id: 1,
                        firstname: "Aupeix",
                        lastname: "Amélie",
                        email: "pakouille.lakouille@yahoo.fr",
                        mobile: "0675650392",
                        photo: "images/volunteers/$taille/amélie_aupeix.jpg",
                        food: "Végétarien",
                        adult: 1,
                        privileges: 0,
                        active: 0,
                        comment: "",
                        timestamp: new Date(0),
                        password: "$2y$10$fSxY9AIuxSiEjwF.J3eXGubIxUPkdq9d5fqpbl8ASimSjNj4SR.9O",
                    }}
                />
            </MemoryRouter>
        ).container.firstChild

        expect(tree).toMatchSnapshot()
    })
})
