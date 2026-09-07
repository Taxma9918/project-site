# Eugène Delacroix Web Application

A web application about the painter Eugène Delacroix (1798–1863), featuring a
biography, a gallery of paintings, exhibitions and reference links. Exhibitions
and links are managed from inside the application by an administrator (CRUD).

**Stack:** Node.js + Express (backend), vanilla HTML/CSS/JavaScript (frontend),
JSON files for storage.

> The user interface and the source-code comments are written in Greek.

## Installation and usage

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

The application runs at <http://localhost:3000> (or on the port given by the
`PORT` environment variable).

## Test accounts

| User    | Password   | Role          | Permissions            |
| ------- | ---------- | ------------- | ---------------------- |
| `admin` | `1234`     | administrator | Create/edit/delete     |
| `user`  | `user1234` | visitor       | Read-only              |

Accounts live in `data/users.json`, not in the source. Passwords are **not**
stored in plain text: the file holds salted scrypt hashes, and comparison is
done in constant time (`crypto.timingSafeEqual`).

To add an account or change a password, generate the entry with the helper
script and paste it into `data/users.json`. The password is read from stdin, so
it never lands in your shell history:

```bash
npm run hash-password -- alice admin
```

Repeated failed logins from the same address are throttled: after 5 failures the
endpoint answers `429` for 15 minutes, and a successful login clears the counter.
The counter lives in memory, so restarting the server also clears it. Both limits
are constants near the top of `server.js`.

## Project structure

```
server.js              Express server: authentication + REST API
data/                  Application data, reachable only through the API
  users.json           Accounts: usernames, roles, scrypt hashes
  biography.json       Biography text
  paintings.json       Painting data
  exhibitions.json     Exhibition data
  links.json           Link data
public/                Static files, served as-is
  index.html           Page structure
  styles.css           Styling (responsive)
  script.js            Frontend logic
  images/              Painting images
scripts/
  hash-password.js     Generates an entry for data/users.json
```

## REST API

`GET` requests are public. `POST`, `PUT` and `DELETE` require an
`Authorization: Bearer <token>` header carrying an administrator token.

| Method   | Path                    | Description                          |
| -------- | ----------------------- | ------------------------------------ |
| `POST`   | `/api/login`            | Sign in, returns a token and a role   |
| `POST`   | `/api/logout`           | Invalidate the token                  |
| `GET`    | `/api/me`               | Verify a token, returns the user      |
| `GET`    | `/api/biography`        | Biography text (read-only)            |
| `GET`    | `/api/paintings`        | All paintings, grouped by category    |
| `POST`   | `/api/paintings`        | Create a painting                     |
| `PUT`    | `/api/paintings/:id`    | Update a painting                     |
| `DELETE` | `/api/paintings/:id`    | Delete a painting                     |
| `GET`    | `/api/exhibitions`      | All exhibitions, grouped by category  |
| `POST`   | `/api/exhibitions`      | Create an exhibition                  |
| `PUT`    | `/api/exhibitions/:id`  | Update an exhibition                  |
| `DELETE` | `/api/exhibitions/:id`  | Delete an exhibition                  |
| `GET`    | `/api/links`            | All links, grouped by category        |
| `POST`   | `/api/links`            | Create a link                         |
| `PUT`    | `/api/links/:id`        | Update a link                         |
| `DELETE` | `/api/links/:id`        | Delete a link                         |

### Data format

Each JSON file is an object keyed by category, and every entry carries a unique
`id`:

```json
{
  "current": [
    { "id": 1, "name": "...", "location": "...", "date": "2025-03-15" }
  ],
  "past": []
}
```

`POST` and `PUT` bodies also include a `category` field. If a `PUT` is given a
different category, the entry is moved into it.

### Example

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}' | jq -r .token)

curl -X POST localhost:3000/api/exhibitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"current","name":"Exhibition","location":"Athens","date":"2026-04-26"}'
```

## Security notes

- Write endpoints check the token **and** the role on the server, not just in
  the UI.
- All data is escaped before it reaches the DOM, so HTML/JavaScript cannot be
  injected (XSS).
- Links are filtered so that only `http:` and `https:` are allowed.
- The server validates incoming data (required fields, date format, URL format)
  and answers with `400` and an explanatory message.
- The server accepts **only** the known fields of each category. This stops a
  client from adding arbitrary keys to the JSON files, or from forging the `id`
  by sending it in the request body.
- Sessions expire after 30 minutes of inactivity (sliding expiry) and expired
  tokens are periodically cleared from memory.
- Writes to the JSON files are atomic (write to a temporary file, then
  `rename`) and serialized per resource, so concurrent requests cannot corrupt
  or lose data.
- The data files live in `data/`, outside the statically served `public/`
  directory, so they can only be reached through the API.
- A painting's `image` field must be a bare filename with an image extension,
  so it cannot point outside `public/images/`.
- Unknown `/api/*` paths answer with JSON, and malformed request bodies get a
  `400` instead of being reported as a server error.
- Accounts live in `data/users.json` rather than in the source code, and only
  salted scrypt hashes are stored.
- The login endpoint is rate limited (5 attempts per 15 minutes per address), so
  passwords cannot be brute forced.
- Every response carries `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` and a strict `Content-Security-Policy`. The policy needs no
  `unsafe-inline`, because the page has no inline scripts, styles or event
  handlers.

The client keeps its token in `sessionStorage`, so a session survives a page
refresh but is discarded once the tab is closed. After a refresh the token is
verified with `GET /api/me`, because sessions live in the server's memory and
are lost on every restart. A production deployment would need a real database,
HTTPS and persistent session storage.
