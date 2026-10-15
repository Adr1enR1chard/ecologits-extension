import type { ProviderCapture } from "../../capture/types";
import { chatgptConversationEndpoint } from "./conversation";
import { chatgptLoggedOutEndpoint } from "./logged-out";

export const chatgptCapture: ProviderCapture = {
    endpoints: [chatgptConversationEndpoint, chatgptLoggedOutEndpoint],
};
