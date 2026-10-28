export function GET(request: Request) {
  return Response.redirect(new URL('/brand/groshly-icon.png', request.url), 308);
}
