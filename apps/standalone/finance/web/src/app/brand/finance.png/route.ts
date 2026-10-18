export function GET(request: Request) {
  return Response.redirect(new URL('/brand/favicon-finance.png', request.url), 308);
}
