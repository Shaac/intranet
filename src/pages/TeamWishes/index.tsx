import loadable from "@loadable/component"

import { Loading, ErrorBoundary } from "../../components"
import { Props, loadData } from "./TeamWishes"

const HomePage = loadable(() => import("./TeamWishes"), {
    fallback: <Loading />,
})

export default (props: Props): JSX.Element => (
    <ErrorBoundary>
        <HomePage {...props} />
    </ErrorBoundary>
)

export { loadData }
