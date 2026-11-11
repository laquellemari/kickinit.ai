"""Generates data/experiences.json, the demo partner catalog.
Run: python3 scripts/build_experiences.py

The venues are real, top-rated Los Angeles-area places chosen from Google Maps
(GET /api/places/search on the live site, November 2026). kickinit has no
partnership with any of them: prices, durations and party sizes are demo values,
and bookings are simulated in the PayPal sandbox. Photos are loaded live from
Google by place id, with credit. Tags line up with quest tags in data/quests.json.
"""
import json

LA = ("Los Angeles", "US")
# id, google place id, name, category, tags, city, country, neighborhood, lat, lng, price, pricing, minutes, (min,max), cuisine, blurb
rows = [
 # Culinary
 ("carasau-pasta-bar", "ChIJbSey_q-5woARFSLzTcdX2Ok", "Carasau Pasta Bar", "culinary", ["restaurant","italian","romantic"], *LA, "Mid-City", 34.0725, -118.3706, "90.00", "per_person", 120, (1,8), "italian", "Dinner for your party at one of LA's best-rated pasta bars."),
 ("trattoria-daly", "ChIJx_h8_E3HwoARua9_zZqT-E8", "Trattoria Daly", "culinary", ["restaurant","italian"], *LA, "Lincoln Heights", 34.0744, -118.2159, "65.00", "per_person", 105, (1,6), "italian", "A neighborhood Italian table on the Eastside."),
 ("n-naka", "ChIJb7GeyDS6woAROVvLEUiLZEk", "n/naka", "culinary", ["restaurant","japanese","tasting_menu","michelin"], *LA, "Palms", 34.0250, -118.4120, "185.00", "per_person", 150, (1,4), "japanese", "A seasonal Japanese tasting menu, booked for your party."),
 ("mutsu", "ChIJv772brO-woARaEyy_31DhEs", "Mutsu", "culinary", ["restaurant","japanese","omakase"], *LA, "Beverly Grove", 34.0770, -118.3760, "150.00", "per_person", 120, (1,4), "japanese", "An omakase counter seating for your group."),
 ("sushi-gen", "ChIJnQsVUDjGwoARcEGiOJrPzZY", "Sushi Gen", "culinary", ["restaurant","japanese"], *LA, "Little Tokyo", 34.0467, -118.2386, "60.00", "per_person", 75, (1,6), "japanese", "Sushi in Little Tokyo, table held for your party."),
 ("bacari-silver-lake", "ChIJ___D30fHwoARymR_1Ylhtto", "Bacari Silverlake", "culinary", ["restaurant","tapas","mediterranean"], *LA, "Silver Lake", 34.0901, -118.2776, "45.00", "per_person", 90, (2,12), "mediterranean", "Small plates to share, sized for a group."),
 ("tacos-y-birria-la-unica", "ChIJWQJvFrDIwoAR2amR2uxXmu0", "Tacos y Birria La Unica", "culinary", ["restaurant","mexican","street_food"], *LA, "Boyle Heights", 34.0230, -118.2170, "28.00", "per_person", 60, (1,8), "mexican", "Birria and tacos, paid ahead for the whole table."),
 ("71above", "ChIJg4Tqa7PHwoARrWA-2kwYfDE", "71Above", "culinary", ["restaurant","rooftop","romantic"], *LA, "Downtown", 34.0510, -118.2540, "75.00", "per_person", 120, (2,10), "american", "Dinner on the 71st floor with the whole city below."),
 ("gritz-n-wafflez", "ChIJmYaCSgDHwoARO8fDPiJj6V0", "Gritz N' Wafflez", "culinary", ["restaurant","brunch","breakfast"], *LA, "Koreatown", 34.0620, -118.2900, "35.00", "per_person", 90, (1,8), "american", "A weekend brunch table for your crew."),
 ("girl-and-the-goat", "ChIJXVodUFfHwoARe63Z7LSuUnY", "Girl & the Goat Los Angeles", "culinary", ["restaurant","chefs_table"], *LA, "Arts District", 34.0400, -118.2330, "70.00", "per_person", 120, (2,10), "american", "Family-style dinner in the Arts District."),
 ("chubby-cattle-little-tokyo", "ChIJ5bmixrjHwoARbYvjq8s1ioU", "Chubby Cattle BBQ | Little Tokyo", "culinary", ["restaurant","korean_bbq"], *LA, "Little Tokyo", 34.0481, -118.2404, "55.00", "per_person", 105, (2,10), "korean", "Korean barbecue for the group, grill included."),
 ("providence", "ChIJaUBtetO-woARqyrV4ASPECg", "Providence", "culinary", ["restaurant","seafood","tasting_menu","michelin"], *LA, "Hollywood", 34.0840, -118.3300, "250.00", "per_person", 150, (1,6), "seafood", "A seafood tasting menu for a big occasion."),
 # Wellness
 ("hugh-spa", "ChIJGfPbiYPHwoAR6PkdEfD69Io", "Hugh Spa", "wellness", ["wellness","spa","bathhouse","sauna","korean_spa"], *LA, "Pico-Union", 34.0510, -118.2920, "95.00", "per_person", 120, (1,6), None, "A two-hour soak-and-sauna circuit."),
 ("desuar-hollywood-spa", "ChIJ1TtQIf3HwoARPWsic8d3Blk", "DESUAR HOLLYWOOD SPA", "wellness", ["wellness","spa","massage","couples_spa","luxury_spa"], *LA, "Hollywood", 34.0980, -118.3340, "210.00", "per_person", 90, (1,2), None, "A ninety-minute massage, solo or side by side."),
 ("quantum-wellness-spa", "ChIJyWD7p1XHwoARyBGRExxeJgs", "Quantum Wellness Spa", "wellness", ["wellness","spa","massage"], *LA, "Westlake", 34.0522, -118.2620, "120.00", "per_person", 60, (1,2), None, "An hour-long treatment at a top-rated day spa."),
 ("sound-bird-center", "ChIJoaaUoXW7woARkfZBsBusizk", "Sound Bird Center", "wellness", ["wellness","sound_bath","meditation"], *LA, "Culver West", 33.9970, -118.4300, "40.00", "per_person", 60, (1,20), None, "A group sound bath to slow the week down."),
 ("olympic-spa", "ChIJj_xq6X_HwoARZfl0Vnmpl0g", "Olympic Spa", "wellness", ["wellness","spa","korean_spa","sauna"], *LA, "Koreatown", 34.0540, -118.3200, "60.00", "per_person", 240, (1,8), None, "A Koreatown spa day pass, scrub optional."),
 # Movement
 ("center-for-yoga", "ChIJ-4Y-_Om5woARZDZ16FJsRLE", "Center for Yoga", "movement", ["fitness","yoga"], *LA, "Larchmont", 34.0760, -118.3230, "25.00", "per_person", 60, (1,25), None, "A drop-in yoga class at LA's top-rated studio."),
 ("hot-8-yoga-koreatown", "ChIJMy8DfnnHwoARrIFi-XVgCPA", "Hot 8 Yoga", "movement", ["fitness","yoga","hot_yoga"], *LA, "Koreatown", 34.0610, -118.2910, "30.00", "per_person", 60, (1,20), None, "Hot yoga, mats and towels included."),
 ("common-ground-pilates", "ChIJA2BQthW5woARRBSxmhjGuO8", "Common Ground Pilates - West Adams", "movement", ["fitness","pilates"], *LA, "West Adams", 34.0260, -118.3450, "38.00", "per_person", 50, (1,10), None, "Small-group reformer Pilates."),
 ("hollywood-boulders", "ChIJD-zMRku_woARZ0UneILkymE", "Hollywood Boulders", "movement", ["fitness","climbing"], *LA, "Hollywood", 34.0910, -118.3180, "30.00", "per_person", 120, (1,20), None, "A bouldering day pass with shoe rental."),
 ("movers-and-shakers-salsa", "ChIJtVb3A3m7woARASvN4qxZhBk", "Movers and Shakers Salsa and Bachata Dance Academy", "movement", ["fitness","dance_class","salsa"], *LA, "Rancho Park", 34.0279, -118.4296, "25.00", "per_person", 75, (1,30), None, "A beginner salsa lesson, no partner needed."),
 # Culture
 ("the-broad", "ChIJXaYsEk3GwoARvx7RKBUE8Zg", "The Broad", "culture", ["arts","museum","gallery"], *LA, "Downtown", 34.0550, -118.2500, "25.00", "per_person", 120, (1,10), None, "Timed entry for your group to the contemporary art museum."),
 ("the-getty", "ChIJbzYnQte8woARJaqqFVpKeNo", "The Getty", "culture", ["arts","museum","architecture_tour","botanical_garden"], *LA, "Brentwood", 34.0770, -118.4730, "30.00", "per_person", 180, (1,10), None, "Art, gardens and views from the hilltop campus."),
 ("the-huntington", "ChIJc1xhAk3bwoARBBlfKQzXKLM", "The Huntington Library, Art Museum, and Botanical Gardens", "culture", ["arts","museum","botanical_garden"], "San Marino", "US", "San Marino", 34.1290, -118.1145, "35.00", "per_person", 180, (1,10), None, "A day in the library, galleries and gardens."),
 ("graff-tours-la", "ChIJR5OxVefPwoARdqpizt6ZVdE", "Graff Tours LA - The Street Art Studio", "culture", ["arts","street_art_tour","tour","mural"], *LA, "Arts District", 34.0327, -118.2607, "35.00", "per_person", 90, (1,15), None, "A guided walk through downtown's murals."),
 ("hollywood-pantages", "ChIJAye4Ajm_woARztbwsoUDFug", "Hollywood Pantages Theatre", "culture", ["arts","performance","theater","musical"], *LA, "Hollywood", 34.1020, -118.3260, "95.00", "per_person", 150, (1,8), None, "Seats together for a touring Broadway show."),
 ("ucb-theatre", "ChIJ-Xxey0a_woARdYN8KXhon1A", "Upright Citizens Brigade Theatre", "culture", ["arts","performance","comedy","improv"], *LA, "Los Feliz", 34.1050, -118.3190, "20.00", "per_person", 90, (1,10), None, "An improv and sketch show night."),
 ("largo-at-the-coronet", "ChIJNT5OKTO5woARk16GLUq6Iv0", "Largo at the Coronet", "culture", ["arts","performance","live_music","comedy"], *LA, "Beverly Grove", 34.0780, -118.3760, "40.00", "per_person", 120, (1,8), None, "An intimate night of music or comedy."),
 # Nightlife
 ("vibrato-grill-jazz", "ChIJh5OU23a9woARNVT36S9qIIA", "Vibrato Grill Jazz", "nightlife", ["nightlife","live_music","jazz","bar"], *LA, "Bel Air", 34.1270, -118.4440, "35.00", "per_person", 150, (1,8), None, "Live jazz with dinner or drinks, table held."),
 ("the-normandie-club", "ChIJCUNzt4K4woAR-z4MIi0ONo4", "The Normandie Club", "nightlife", ["nightlife","speakeasy","cocktail_bar","bar"], *LA, "Koreatown", 34.0630, -118.3010, "55.00", "per_person", 120, (2,6), None, "A cocktail-bar table for a small group."),
 ("seven-grand", "ChIJd-OpVLTHwoARJ3fFiZG_xD4", "Seven Grand", "nightlife", ["nightlife","bar","live_music"], *LA, "Downtown", 34.0470, -118.2560, "45.00", "per_person", 120, (1,8), None, "A whiskey-bar night, first round on the booking."),
 ("mic-drop-karaoke", "ChIJLbsIpXW_woARp9fl4vFssRc", "Mic Drop Karaoke", "nightlife", ["nightlife","karaoke"], "West Hollywood", "US", "West Hollywood", 34.0860, -118.3830, "120.00", "per_group", 120, (2,10), None, "A private karaoke room for up to ten."),
 ("perch", "ChIJqbKnF0vGwoARREUrVhYGqTU", "Perch", "nightlife", ["nightlife","rooftop_bar","rooftop","late_night"], *LA, "Downtown", 34.0490, -118.2510, "40.00", "per_person", 180, (1,12), None, "A rooftop table downtown into the late hours."),
 ("black-rabbit-rose", "ChIJV3xsfDu_woARPqRFfDwevKQ", "Black Rabbit Rose Magic", "nightlife", ["nightlife","magic","cocktail_bar"], *LA, "Hollywood", 34.1018, -118.3322, "65.00", "per_person", 120, (2,8), None, "Cocktails and a close-up magic show."),
 ("highland-park-bowl", "ChIJRfFNcBDEwoAReJUPG2XR76k", "Highland Park Bowl", "nightlife", ["nightlife","bowling","bar"], *LA, "Highland Park", 34.1090, -118.1940, "90.00", "per_group", 120, (2,8), None, "A lane for your group for two hours."),
 # Outdoors
 ("la-yacht-charter", "ChIJHU7MWnmwwoARVx8bTyXXrrg", "Los Angeles Yacht Charter", "outdoors", ["outdoors","sunset","sailing","sunset_cruise"], "Marina del Rey", "US", "Marina del Rey", 33.9740, -118.4470, "120.00", "per_person", 120, (2,12), None, "Two hours on the water as the sun goes down."),
 ("pro-sup-shop", "ChIJESb-8Jm6woAR02upgSOLopk", "Pro SUP Shop", "outdoors", ["outdoors","sup","paddle"], "Marina del Rey", "US", "Marina del Rey", 33.9820, -118.4590, "55.00", "per_person", 90, (1,10), None, "Paddleboard in the marina, board and lesson included."),
 ("kapowui-surf", "ChIJK0MvXcakwoAR6f3_igj7rzo", "Kapowui Surf Lessons Santa Monica / Venice", "outdoors", ["outdoors","surf","beach"], "Santa Monica", "US", "Ocean Park", 33.9979, -118.4842, "85.00", "per_person", 120, (1,6), None, "A beginner surf lesson, board and wetsuit included."),
 ("echo-park-swan-boats", "ChIJAax4xwTHwoARBc6_jBo0sU8", "Echo Park Swan Boats by Wheel Fun Rentals", "outdoors", ["outdoors","paddle","lake","park"], *LA, "Echo Park", 34.0732, -118.2600, "30.00", "per_group", 60, (2,4), None, "An hour in a swan boat on Echo Park Lake."),
 ("socal-whale-watching", "ChIJZYxcHmgx3YAR-0eSk0OamRE", "SoCal Whale Watching", "outdoors", ["outdoors","whale_watching","boat_tour","wildlife"], "Long Beach", "US", "Downtown Long Beach", 33.7610, -118.1960, "65.00", "per_person", 150, (1,12), None, "A whale-watching trip out of Long Beach."),
 ("bikes-and-hikes-la", "ChIJx-LMLKW-woARIMm0qR9IDcY", "Bikes and Hikes LA - Los Angeles Tours", "outdoors", ["outdoors","hike","tour","bike_tour"], *LA, "Fairfax", 34.0906, -118.3579, "75.00", "per_person", 180, (1,12), None, "A guided hike to the Hollywood sign views."),
 # Learn & create
 ("pottery-studio-1", "ChIJafI55oTHwoARETYM1vS1h5U", "Pottery Studio 1 Downtown LA", "create", ["workshop","pottery"], *LA, "Downtown", 34.0530, -118.2470, "75.00", "per_person", 150, (1,8), None, "A wheel-throwing class; they fire your best piece."),
 ("cozymeal-sushi-class", "ChIJwafVLn67woAREQ8ZQ3ZS5_M", "Cozymeal Cooking Classes", "create", ["cooking_class","workshop","japanese"], *LA, "Westwood", 34.0590, -118.4430, "95.00", "per_person", 120, (1,10), None, "A hands-on sushi-making class with a chef."),
 ("gourmandise-school", "ChIJMRfJu9GkwoAR7-YEUU7G7MI", "The Gourmandise School", "create", ["cooking_class","workshop"], "Santa Monica", "US", "Downtown Santa Monica", 34.0140, -118.4930, "85.00", "per_person", 150, (1,10), None, "A hands-on cooking class; you eat what you make."),
 ("abc-bartending-school", "ChIJ2z41n7KwwoARTCvniZgsMgE", "ABC Bartending School", "create", ["workshop","mixology"], *LA, "Palms", 34.0270, -118.3940, "65.00", "per_person", 90, (2,10), None, "Shake four classics and invent one of your own."),
 # Getaways
 ("the-cactai", "ChIJPZ2ZiSsb24ARB_8qZfprXA8", "The Cactai", "getaways", ["getaway","boutique_hotel","weekend"], "Palm Springs", "US", "Palm Springs", 33.8420, -116.5450, "420.00", "per_group", 2880, (1,4), None, "Two nights at a boutique desert hotel."),
 ("ojai-valley-inn", "ChIJHxKSKkCl6YART39IacRTAM4", "Ojai Valley Inn", "getaways", ["getaway","spa_resort","weekend"], "Ojai", "US", "Ojai", 34.4370, -119.2550, "650.00", "per_group", 1440, (1,4), None, "A night at the Ojai resort, spa access included."),
 ("malibu-beach-inn", "ChIJw1C0bioe6IARsawVhVmINis", "Malibu Beach Inn", "getaways", ["getaway","beach","beach_resort"], "Malibu", "US", "Carbon Beach", 34.0380, -118.6750, "480.00", "per_group", 1440, (1,2), None, "A night on the sand in Malibu."),
 ("sustainable-wine-tours", "ChIJf98yLTAV6YARDpU_WVG351o", "Sustainable Wine Tours", "getaways", ["food_tour","tour","getaway","wine_country","winery"], "Santa Barbara", "US", "Santa Barbara", 34.4220, -119.7050, "95.00", "per_person", 300, (1,12), None, "A guided Santa Barbara wine-country day."),
]

COLORS = {"culinary":"#D7E6F2","wellness":"#DCEBEB","movement":"#E0E6EC","culture":"#D6DCEC","nightlife":"#D6DCEC","outdoors":"#CFE3F0","create":"#E0E6EC","getaways":"#D2E8F1"}

out = []
for (id_, place_id, name, cat, tags, city, country, hood, lat, lng, price, pricing, minutes, party, cuisine, blurb) in rows:
    e = {"id": id_, "name": name, "category": cat, "tags": tags, "city": city, "country": country, "neighborhood": hood,
         "lat": lat, "lng": lng, "price": price, "currency": "USD", "pricing": pricing, "durationMinutes": minutes,
         "partyMin": party[0], "partyMax": party[1], "description": blurb, "placeId": place_id, "bg": COLORS[cat]}
    if cuisine: e["cuisine"] = cuisine
    out.append(e)
assert len(out) == 50, len(out)
assert len({e["id"] for e in out}) == len(out)
assert len({e["placeId"] for e in out}) == len(out)
json.dump({"version": 2, "experiences": out}, open("data/experiences.json", "w"), indent=1, ensure_ascii=False)
print(len(out), "experiences")
