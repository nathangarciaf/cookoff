import { createContext, useContext } from "react";

export const CookoffContext = createContext(null);
export const useCookoff = () => useContext(CookoffContext);
