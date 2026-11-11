"""Generates data/experiences.json — the demo partner catalog.
Run: python3 scripts/build_experiences.py
Tags line up with quest tags in data/quests.json so bookings move quests forward."""
import json

# id, name, category, tags, city, neighborhood, country, lat, lng, price, pricing, minutes, party(min,max), cuisine, blurb
M = ("Miami", "US")
rows = [
 # Culinary
 ("marea", "Ristorante Marea", "culinary", ["restaurant","italian","waterfront","romantic"], *M, "Coconut Grove", 25.7280, -80.2420, "90.00", "per_person", 120, (1,8), "italian", "Handmade pasta on a terrace over the bay. Ask for the corner table at sunset."),
 ("osteria-lume", "Osteria Lume", "culinary", ["restaurant","italian"], *M, "Little River", 25.8380, -80.1930, "65.00", "per_person", 105, (1,6), "italian", "Twelve seats, a wood oven and a short, all-Italian wine list."),
 ("pasta-club-pasta", "Pasta by Hand", "create", ["cooking_class","pasta","workshop"], *M, "Little River", 25.8370, -80.1945, "85.00", "per_person", 150, (1,10), None, "Make tagliatelle and ravioli from scratch, then eat everything you made."),
 ("kaito-omakase", "Kaito Omakase", "culinary", ["restaurant","omakase","japanese","tasting_menu"], *M, "Brickell", 25.7650, -80.1930, "185.00", "per_person", 120, (1,4), "japanese", "Eighteen courses at an eight-seat cedar counter."),
 ("la-tapa", "La Tapa", "culinary", ["restaurant","tapas","group"], *M, "Wynwood", 25.8010, -80.1990, "45.00", "per_person", 90, (2,12), "spanish", "Small plates, vermouth on tap and long shared tables."),
 ("sol-taqueria", "Sol Taquería", "culinary", ["restaurant","mexican","street_food"], *M, "Little Havana", 25.7660, -80.2190, "28.00", "per_person", 60, (1,8), "mexican", "Al pastor off the trompo and a salsa bar worth the trip."),
 ("rooftop-21", "Rooftop 21", "culinary", ["restaurant","rooftop","cocktail_bar"], *M, "Downtown", 25.7740, -80.1910, "75.00", "per_person", 120, (2,10), "american", "Skyline views, a raw bar and a DJ from 9pm."),
 ("brunch-house", "The Brunch House", "culinary", ["restaurant","brunch","breakfast"], *M, "South Beach", 25.7800, -80.1310, "35.00", "per_person", 90, (1,8), "american", "Ricotta pancakes and bottomless cafecito, weekends from 9am."),
 # Wellness
 ("still-water", "Still Water Bathhouse", "wellness", ["wellness","spa","bathhouse","sauna","cold_plunge"], *M, "Wynwood", 25.8020, -80.2000, "95.00", "per_person", 120, (1,6), None, "Two-hour thermal circuit: sauna, steam, cold plunge, rest."),
 ("halcyon-spa", "Halcyon Spa", "wellness", ["wellness","spa","massage","couples_spa","luxury_spa"], *M, "Miami Beach", 25.8150, -80.1220, "210.00", "per_person", 90, (1,2), None, "Ninety-minute signature massage, with a couples suite."),
 ("sound-bath-grove", "Sound Bath in the Grove", "wellness", ["wellness","sound_bath","meditation"], *M, "Coconut Grove", 25.7290, -80.2400, "40.00", "per_person", 60, (1,20), None, "Crystal bowls and gongs under the banyan trees."),
 ("breathe-studio", "Breathe Studio", "wellness", ["wellness","breathwork","meditation"], *M, "Brickell", 25.7600, -80.1950, "35.00", "per_person", 60, (1,15), None, "Guided breathwork followed by a short cold-plunge option."),
 ("korean-spa-miami", "Seoul Spa", "wellness", ["wellness","spa","korean_spa","sauna"], *M, "Doral", 25.8190, -80.3550, "60.00", "per_person", 240, (1,8), None, "Jjimjilbang day pass: hot rooms, salt room and a body scrub."),
 # Movement
 ("sunrise-yoga-beach", "Sunrise Yoga on the Beach", "movement", ["fitness","yoga","outdoor_yoga","sunrise"], *M, "South Beach", 25.7820, -80.1290, "25.00", "per_person", 60, (1,25), None, "Vinyasa at 6:30am as the sun comes up over the Atlantic."),
 ("ironbox-hiit", "IronBox HIIT", "movement", ["fitness","hiit","strength"], *M, "Wynwood", 25.8000, -80.1980, "30.00", "per_person", 45, (1,20), None, "Forty-five minutes, heart-rate screens, no mercy."),
 ("bay-run-club", "Bayfront Run Club", "movement", ["fitness","run_club"], *M, "Downtown", 25.7750, -80.1860, "10.00", "per_person", 60, (1,40), None, "5K social run along the bay, Thursdays at 7pm."),
 ("reformer-lab", "Reformer Lab", "movement", ["fitness","pilates"], *M, "Coral Gables", 25.7490, -80.2600, "38.00", "per_person", 50, (1,10), None, "Small-group reformer Pilates."),
 ("salsa-calle-ocho", "Salsa on Calle Ocho", "movement", ["fitness","dance_class","salsa"], *M, "Little Havana", 25.7655, -80.2180, "25.00", "per_person", 75, (1,30), None, "Beginner salsa lesson, then the floor opens up."),
 # Culture
 ("perez-museum", "Pérez Art Museum Pass", "culture", ["arts","museum","gallery"], *M, "Downtown", 25.7860, -80.1860, "24.00", "per_person", 120, (1,10), None, "Timed entry to the bayfront museum and its hanging gardens."),
 ("wynwood-walls-tour", "Wynwood Street Art Tour", "culture", ["arts","street_art_tour","tour"], *M, "Wynwood", 25.8010, -80.1995, "35.00", "per_person", 90, (1,15), None, "A muralist walks you through the walls and the stories behind them."),
 ("arsht-ballet", "Ballet at the Arsht", "culture", ["arts","performance","ballet"], *M, "Downtown", 25.7870, -80.1890, "85.00", "per_person", 150, (1,8), None, "Miami City Ballet's winter program."),
 ("comedy-cellar-mia", "Basement Comedy", "culture", ["arts","performance","comedy"], *M, "Brickell", 25.7620, -80.1920, "30.00", "per_person", 90, (1,10), None, "Five comics, one drink minimum, very small room."),
 # Nightlife
 ("blue-room", "The Blue Room", "nightlife", ["nightlife","live_music","jazz","bar"], *M, "Little Havana", 25.7650, -80.2200, "35.00", "per_person", 150, (1,8), None, "Late jazz sets, Cuban rum flights, sets start at 10pm."),
 ("speakeasy-door", "The Unmarked Door", "nightlife", ["nightlife","speakeasy","cocktail_bar","bar"], *M, "Brickell", 25.7630, -80.1940, "55.00", "per_person", 120, (2,6), None, "Reservations only. The password arrives by text."),
 ("karaoke-box", "Neon Karaoke Box", "nightlife", ["nightlife","karaoke"], *M, "Midtown", 25.8080, -80.1920, "120.00", "per_group", 120, (2,10), None, "Private room for up to 10, 8,000 songs, a tambourine."),
 ("rooftop-dj", "Sky Deck Sessions", "nightlife", ["nightlife","club","late_night"], *M, "South Beach", 25.7810, -80.1300, "40.00", "per_person", 180, (1,12), None, "Rooftop DJ sets from 10pm until late."),
 # Outdoors
 ("biscayne-dusk", "Biscayne at Dusk Sail", "outdoors", ["outdoors","sunset","sail"], *M, "Bayside", 25.7780, -80.1860, "120.00", "per_person", 120, (2,12), None, "Two hours on a catamaran as the city lights come on."),
 ("sunset-sup", "Sunset Paddleboard", "outdoors", ["outdoors","sup","paddle","sunset"], *M, "Key Biscayne", 25.6930, -80.1630, "55.00", "per_person", 90, (1,10), None, "Calm-water SUP with a guide, boards included."),
 ("everglades-airboat", "Everglades Airboat", "outdoors", ["outdoors","tour","nature"], *M, "Everglades", 25.7600, -80.5500, "65.00", "per_person", 120, (1,12), None, "Gators, sawgrass and a very loud fan."),
 ("dawn-kayak", "Dawn Mangrove Kayak", "outdoors", ["outdoors","kayak","sunrise"], *M, "Oleta River", 25.9170, -80.1370, "60.00", "per_person", 120, (1,8), None, "Launch at 6:45am through the mangrove tunnels."),
 # Learn & create
 ("clay-studio", "Wheel Throwing 101", "create", ["workshop","pottery"], *M, "Little River", 25.8360, -80.1950, "75.00", "per_person", 150, (1,8), None, "Two hours on the wheel; we fire and glaze your best piece."),
 ("sushi-school", "Sushi School", "create", ["cooking_class","sushi","workshop"], *M, "Brickell", 25.7640, -80.1935, "95.00", "per_person", 120, (1,10), None, "Rice, knife work and hand rolls with a former omakase chef."),
 ("dumpling-night", "Dumpling Folding Night", "create", ["cooking_class","dumpling","workshop"], *M, "Downtown", 25.7750, -80.1950, "70.00", "per_person", 120, (2,12), None, "Fold, pleat and pan-fry three styles of dumpling."),
 ("cocktail-lab", "Cocktail Lab", "create", ["workshop","cocktail_class"], *M, "Wynwood", 25.8015, -80.1985, "65.00", "per_person", 90, (2,10), None, "Shake four classics and invent one of your own."),
 # Getaways
 ("keys-cottage", "The Keys, Slowly", "getaways", ["getaway","beach","weekend"], "Islamorada", "US", "Upper Keys", 24.9240, -80.6280, "420.00", "per_group", 2880, (1,4), None, "Two nights in a beach cottage, kayaks and bikes included."),
 ("austin-food-tour", "Austin BBQ & Taco Crawl", "getaways", ["food_tour","tour","getaway"], "Austin", "US", "East Austin", 30.2620, -97.7270, "95.00", "per_person", 210, (1,12), None, "Brisket, breakfast tacos and a lot of walking."),
 ("cdmx-street-food", "Mexico City Street Food Walk", "getaways", ["food_tour","street_food","international"], "Mexico City", "MX", "Roma Norte", 19.4170, -99.1620, "60.00", "per_person", 180, (1,10), None, "Tacos de canasta, tlacoyos and the best churro stand in Roma."),
 ("tulum-retreat", "Tulum Day Retreat", "getaways", ["getaway","wellness","day_retreat","international"], "Tulum", "MX", "Zona Hotelera", 20.1960, -87.4640, "180.00", "per_person", 480, (1,6), None, "Cenote swim, temazcal and a beach lunch."),
]

def color(cat):
    return {"culinary":"#D7E6F2","wellness":"#DCEBEB","movement":"#E0E6EC","culture":"#D6DCEC","nightlife":"#D6DCEC","outdoors":"#CFE3F0","create":"#E0E6EC","getaways":"#D2E8F1"}[cat]

out = []
for (id_, name, cat, tags, city, country, hood, lat, lng, price, pricing, minutes, party, cuisine, blurb) in rows:
    e = {"id": id_, "name": name, "category": cat, "tags": tags, "city": city, "country": country, "neighborhood": hood,
         "lat": lat, "lng": lng, "price": price, "currency": "USD", "pricing": pricing, "durationMinutes": minutes,
         "partyMin": party[0], "partyMax": party[1], "description": blurb, "photo": name.lower(), "bg": color(cat)}
    if cuisine: e["cuisine"] = cuisine
    out.append(e)
assert len({e["id"] for e in out}) == len(out)
json.dump({"version": 1, "experiences": out}, open("data/experiences.json", "w"), indent=1, ensure_ascii=False)
print(len(out), "experiences")
