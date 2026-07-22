"use client"; import { useTranslations } from "next-intl";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){const t=useTranslations("errors");return <main className="auth-main"><div className="auth-box"><h1>{t("unexpected")}</h1><button className="button primary" onClick={reset}>{t("retry")}</button></div></main>}
