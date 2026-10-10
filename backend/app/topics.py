"""Quick-practice content for each part. Part 2 and 3 also include the material from the full mock tests."""
from .mock_tests import MOCK_TESTS, cue_card_text

PART1 = {
    "hometown": {"title": "Hometown & Home", "questions": [
        "Let's talk about your hometown. Where are you from?",
        "What do you like most about your hometown?",
        "Has your hometown changed much in recent years?",
        "Would you like to live there in the future?",
    ]},
    "work": {"title": "Work & Study", "questions": [
        "Do you work or are you a student?",
        "What do you enjoy most about your work or studies?",
        "What would you like to change about it?",
        "What are your plans for the future?",
    ]},
    "technology": {"title": "Technology", "questions": [
        "How often do you use technology in your daily life?",
        "Which piece of technology is most useful to you?",
        "Do people rely too much on technology today?",
        "How might technology change education in the future?",
    ]},
    "travel": {"title": "Travel", "questions": [
        "Do you enjoy travelling?",
        "Tell me about a memorable place you have visited.",
        "Do you prefer travelling alone or with other people?",
        "Why is tourism important for a country?",
    ]},
    "food": {"title": "Food & Cooking", "questions": [
        "What kind of food do you like to eat?",
        "Do you enjoy cooking? Why or why not?",
        "Is there a dish from your country you would recommend to visitors?",
        "Do you prefer eating at home or eating out?",
    ]},
    "free-time": {"title": "Free Time", "questions": [
        "What do you like to do in your free time?",
        "Do you have more free time now than when you were a child?",
        "Do you prefer spending free time alone or with others?",
        "Is there a new hobby you would like to try?",
    ]},
    "sport": {"title": "Sport & Exercise", "questions": [
        "Do you play any sports?",
        "How do you usually keep fit?",
        "Which sports are popular in your country?",
        "Did you do much sport at school?",
    ]},
    "friends": {"title": "Friends", "questions": [
        "How often do you see your friends?",
        "What do you usually do together?",
        "Is it easy for you to make new friends?",
        "Do you prefer having a few close friends or many friends?",
    ]},
}

_EXTRA_CARDS = [
    {
        "id": "helped",
        "prompt": "Describe a time you helped someone.",
        "points": ["who you helped", "what the situation was", "how you helped them"],
        "closing": "and explain how you felt about helping them.",
    },
    {
        "id": "gadget",
        "prompt": "Describe a piece of technology you find useful.",
        "points": ["what it is", "when you got it", "how often you use it"],
        "closing": "and explain why it is so useful to you.",
    },
    {
        "id": "celebration",
        "prompt": "Describe a celebration you enjoyed.",
        "points": ["what was celebrated", "where it took place", "who was there"],
        "closing": "and explain why you enjoyed it.",
    },
]

PART2 = [{"id": t["id"], **{k: t["part2"][k] for k in ("prompt", "points", "closing")}} for t in MOCK_TESTS] + _EXTRA_CARDS
for card in PART2:
    card["question"] = cue_card_text(card)

_EXTRA_DISCUSSIONS = {
    "helping": {"title": "Helping others", "questions": [
        "Why do some people do volunteer work?",
        "Should schools require students to do community service?",
        "Are people less willing to help strangers than in the past?",
        "Who should be responsible for helping the elderly: families or governments?",
    ]},
    "society-tech": {"title": "Technology and society", "questions": [
        "Has technology made people's lives less stressful or more stressful?",
        "Should older people be encouraged to learn new technology?",
        "What are the risks of relying on artificial intelligence?",
        "Will people still work in offices in the future?",
    ]},
}

PART3 = {t["id"]: {"title": t["part3"]["topic"], "questions": t["part3"]["questions"]} for t in MOCK_TESTS} | _EXTRA_DISCUSSIONS

TOPICS = {"part1": PART1, "part2": PART2, "part3": PART3}
