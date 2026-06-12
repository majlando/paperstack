# Installation guide

Kantina ships as a single runnable JAR per client plus a shared SQLite file
on the canteen's network drive.

## Requirements

- Java 21 or later (`java --version` to check)
- Write access to the shared folder `\\canteen-nas\kantina\`
- For the kitchen display: a screen of at least 1280×800, mounted readable
  from the prep line

## Steps

1. Copy `kantina-kitchen.jar`, `kantina-manager.jar`, and
   `kantina-client.jar` from the release folder.
2. Run the manager client once to create the database:

   ```text
   java -jar kantina-manager.jar --init \\canteen-nas\kantina\kantina.db
   ```

3. Enter the week's menu and today's cut-off time in the manager console.
4. Start the kitchen display with autostart on the prep-line machine:

   ```text
   java -jar kantina-kitchen.jar \\canteen-nas\kantina\kantina.db
   ```

5. Distribute the ordering client through the academy's software portal; it
   reads the database location from `kantina.properties`.

## Verifying the installation

Place a test order from the ordering client and confirm it appears on the
kitchen tally within five seconds, then confirm the pick-up with one tap and
check that the order's state reads `PICKED_UP` in the manager console's
audit view.
