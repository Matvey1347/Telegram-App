"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import Link from "next/link";

type Locale = "uk" | "en";
type Kind = "privacy" | "terms";
type Section = { title: string; body: string };

const copy: Record<Locale, Record<Kind, { title: string; intro: string; sections: Section[] }>> = {
  en: {
    privacy: {
      title: "Privacy Policy",
      intro: "This notice explains how Groshly handles information when you use the personal finance service in a browser or Telegram Mini App.",
      sections: [
        { title: "Information we process", body: "We receive your Telegram account identifier and available profile details to verify sign-in. We store the accounts, transactions, categories, debts, settings and other finance records you choose to enter. Technical session and security data are used to keep your account available and protected." },
        { title: "Why we use it", body: "Account and finance records are processed to provide the service you request. Session and security data support authentication, abuse prevention and service reliability. These purposes rely on performance of the service agreement and, for security, our legitimate interests." },
        { title: "Who receives information", body: "Telegram processes data when you use its bot or Mini App. Our hosting and database providers process the information needed to operate Groshly on our behalf. We do not sell your finance records." },
        { title: "Storage and retention", body: "Finance records remain while your account is active or until you remove them. Some records may be retained afterward where required by law or needed to resolve a security incident or dispute. Browser storage keeps preferences and a local display cache; you can clear it in your browser." },
        { title: "Your choices and rights", body: "You may request access, correction, export or deletion of your data, and may object to or request restriction of processing where applicable. You may complain to your local data protection authority. Contact the operator using the details below to exercise these rights." },
        { title: "Security and changes", body: "Telegram sign-in is checked by the Groshly server. We may update this notice when the service changes and will show the updated date on this page." },
      ],
    },
    terms: {
      title: "Terms & Conditions",
      intro: "These terms describe your use of Groshly, a tool for recording and reviewing personal finances.",
      sections: [
        { title: "The service", body: "Groshly helps you record accounts, transactions, debts and related information. Displayed balances and analytics depend on the information you enter. Groshly is not a bank, payment service or financial adviser, and recording an item does not move money." },
        { title: "Your account", body: "You sign in through your Telegram account. Keep access to that account and your devices secure, and tell us if you suspect unauthorized use. You are responsible for the accuracy and lawful use of information you enter." },
        { title: "Availability and changes", body: "We may maintain, improve or change features. We will give appropriate notice of material changes. We cannot guarantee uninterrupted access, but will take reasonable steps to restore service after an outage." },
        { title: "Fees", body: "Any paid feature must show its price and conditions before you purchase it. These terms alone do not authorize a charge." },
        { title: "Ending use", body: "You may stop using Groshly and request deletion of your account data. We may restrict access when necessary to protect the service, users or legal rights, subject to applicable law." },
        { title: "Your rights and contact", body: "Mandatory consumer rights under applicable law remain in force. For questions about these terms or your data, contact the operator using the details below." },
      ],
    },
  },
  uk: {
    privacy: {
      title: "Політика конфіденційності",
      intro: "Ця політика пояснює, як Groshly обробляє дані під час користування сервісом особистих фінансів у браузері та Telegram Mini App.",
      sections: [
        { title: "Які дані ми обробляємо", body: "Ми отримуємо ідентифікатор Telegram та доступні дані профілю для перевірки входу. Ми зберігаємо рахунки, операції, категорії, борги, налаштування й інші фінансові записи, які ви додаєте. Дані сесії та безпеки потрібні для роботи й захисту акаунта." },
        { title: "Для чого використовуємо дані", body: "Записи обробляються для надання запитаного сервісу. Дані сесії та безпеки підтримують вхід, запобігання зловживанням і надійність. Підстави: виконання угоди про сервіс і наш законний інтерес у захисті сервісу." },
        { title: "Кому передаються дані", body: "Telegram обробляє дані під час використання бота або Mini App. Постачальники хостингу та бази даних обробляють потрібні для роботи Groshly дані за нашим дорученням. Ми не продаємо ваші фінансові записи." },
        { title: "Зберігання", body: "Фінансові записи зберігаються, поки активний акаунт або доки ви їх не видалите. Частина даних може зберігатися довше, якщо цього вимагає закон або це потрібно для вирішення інциденту чи спору. Браузер зберігає налаштування та локальний кеш, який можна очистити." },
        { title: "Ваші права", body: "Ви можете запросити доступ, виправлення, експорт або видалення даних, а також заперечити проти обробки чи вимагати її обмеження у передбачених законом випадках. Ви можете звернутися до органу захисту даних. Контакти оператора наведено нижче." },
        { title: "Безпека та зміни", body: "Вхід через Telegram перевіряється сервером Groshly. Якщо сервіс зміниться, ми оновимо цю політику та дату її редакції." },
      ],
    },
    terms: {
      title: "Умови використання",
      intro: "Ці умови описують використання Groshly — інструмента для обліку й перегляду особистих фінансів.",
      sections: [
        { title: "Сервіс", body: "Groshly допомагає записувати рахунки, операції, борги та пов’язані дані. Баланси й аналітика залежать від ваших записів. Groshly не є банком, платіжним сервісом або фінансовим радником; запис операції не переказує гроші." },
        { title: "Акаунт", body: "Вхід відбувається через Telegram. Захищайте доступ до свого акаунта й пристроїв та повідомляйте про підозру на несанкціонований доступ. Ви відповідаєте за точність і законність внесених даних." },
        { title: "Доступність і зміни", body: "Ми можемо підтримувати, поліпшувати або змінювати функції та повідомимо про суттєві зміни. Ми не гарантуємо безперервний доступ, але вживатимемо розумних заходів для відновлення після збою." },
        { title: "Оплата", body: "Ціна й умови платної функції мають бути показані до покупки. Ці умови самі по собі не дозволяють списати кошти." },
        { title: "Припинення користування", body: "Ви можете припинити користуватися Groshly та запросити видалення даних акаунта. Ми можемо обмежити доступ для захисту сервісу, користувачів або законних прав відповідно до закону." },
        { title: "Права та контакт", body: "Обов’язкові права споживачів за застосовним законом зберігаються. З питаннями щодо умов або даних звертайтеся до оператора за контактами нижче." },
      ],
    },
  },

};

const legalName = "Groshly";
const legalEmail = "matveybogdantg@gmail.com";

export function FinanceLegalPage({ kind, initialLocale = "uk", initialTheme = "light" }: { kind: Kind; initialLocale?: Locale; initialTheme?: "light" | "dark" }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  useEffect(() => {
    window.localStorage.setItem("groshly-language", locale);
    window.localStorage.setItem("groshly-theme", theme);
    document.cookie = `groshly-language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `groshly-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = locale;
  }, [locale, theme]);
  const content = copy[locale][kind];
  const icon = process.env.NODE_ENV === "development"
    ? theme === "dark" ? "/brand/groshly-dev-dark-icon.png" : "/brand/groshly-dev-icon.png"
    : theme === "dark" ? "/brand/groshly-dark-icon.png" : "/brand/groshly-icon.png";
  return <main className="groshly-legal" data-theme={theme} lang={locale}>
    <header>
      <Link href="/" className="groshly-legal-brand"><img src={icon} alt="" /><span>Groshly<span>.</span></span></Link>
      <div>
        <div className="groshly-legal-languages" role="group" aria-label="Language"><button type="button" aria-pressed={locale === "uk"} onClick={() => setLocale("uk")}>🇺🇦 Українська</button><button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>🇬🇧 English</button></div>
        <button type="button" aria-label={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      </div>
    </header>
    <article>
      <Link className="groshly-legal-back" href="/">← Groshly</Link>
      <h1>{content.title}</h1>
      <p className="groshly-legal-intro">{content.intro}</p>
      <p className="groshly-legal-date">26 October 2026</p>
      {content.sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
      <section><h2>{locale === "uk" ? "Оператор і контакт" : "Operator and contact"}</h2>
        <p>{legalName} · <a href={`mailto:${legalEmail}`}>{legalEmail}</a></p>
      </section>
      <nav><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms &amp; Conditions</Link></nav>
    </article>
  </main>;
}
