# Finance bank import prerequisites

Bank Import is not a shipped Finance Pro entitlement. The application exposes no bank-provider registry, connection UI, credential capture, or import runtime until production provider access exists.

## Monobank

A centralized SaaS integration must use Monobank's official provider API and company/provider authorization. The former personal `X-Token` adapter was removed because a customer's personal API token is not an appropriate production SaaS integration. Revisit only after provider access, `keyId`, contractual approval, and an approved onboarding flow are available.

## PrivatBank

Use the regulated Open Banking AISP route. A registered TPP, the required qualified certificates, bank onboarding, production credentials, consent flow, and conformance testing must be available before implementation begins.

## PUMB

Use Open Banking with completed TPP onboarding and production credentials. Sandbox or capability documentation alone is not production support.

## Sense Bank

Do not implement an adapter until sufficient official provider documentation, onboarding, credentials, and a testable production authorization flow are available.

No bank should be displayed as available or “coming soon” based only on hardcoded capability records.
