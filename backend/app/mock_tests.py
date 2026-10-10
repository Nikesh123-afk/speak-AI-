"""Full IELTS Speaking mock tests. Part 3 questions follow on from the Part 2 theme, as in the real exam."""

MOCK_TESTS = [
    {
        "id": "skills",
        "title": "Test 1 · Learning & skills",
        "part1": {"topic": "Daily routine", "questions": [
            "Let's talk about your daily routine. What time do you usually get up?",
            "What is the busiest part of your day?",
            "Do you prefer mornings or evenings? Why?",
            "Has your routine changed in the last few years?",
        ]},
        "part2": {
            "prompt": "Describe a skill you learned that took a long time to master.",
            "points": ["what the skill was", "when and why you started learning it", "how you learned it"],
            "closing": "and explain why it took you so long to learn.",
        },
        "part3": {"topic": "Learning and skills", "questions": [
            "Which skills do you think are most important for young people to learn today?",
            "Is it better to learn a skill from a teacher or by teaching yourself?",
            "Why do some people give up learning new skills as they get older?",
            "How might technology change the way people learn practical skills in the future?",
        ]},
    },
    {
        "id": "places",
        "title": "Test 2 · Places & travel",
        "part1": {"topic": "Music", "questions": [
            "Do you listen to music often?",
            "What kind of music did you enjoy as a child?",
            "Have you ever learned to play a musical instrument?",
            "Do you think music is important at celebrations?",
        ]},
        "part2": {
            "prompt": "Describe a place you have visited that you would like to go back to.",
            "points": ["where it is", "when you went there and who with", "what you did there"],
            "closing": "and explain why you would like to return.",
        },
        "part3": {"topic": "Tourism", "questions": [
            "Why do people enjoy visiting places they have been to before?",
            "What are the advantages and disadvantages of tourism for local communities?",
            "Should popular tourist sites limit the number of visitors?",
            "How do you think travel will change over the next twenty years?",
        ]},
    },
    {
        "id": "people",
        "title": "Test 3 · People & influence",
        "part1": {"topic": "Friends", "questions": [
            "How often do you see your friends?",
            "What do you usually do together?",
            "Is it easy for you to make new friends?",
            "Do you prefer having a few close friends or many friends?",
        ]},
        "part2": {
            "prompt": "Describe a person who has had an important influence on your life.",
            "points": ["who this person is", "how you know them", "what they have done for you"],
            "closing": "and explain why their influence has been so important.",
        },
        "part3": {"topic": "Role models", "questions": [
            "What kinds of people do young people look up to today?",
            "Do you think celebrities have a responsibility to be good role models?",
            "How has the influence of family on young people changed compared with the past?",
            "Can a person be a role model without being famous?",
        ]},
    },
    {
        "id": "media",
        "title": "Test 4 · Books & media",
        "part1": {"topic": "Reading", "questions": [
            "Do you enjoy reading?",
            "What did you like to read when you were younger?",
            "Do you prefer printed books or reading on a screen?",
            "Where do you usually read?",
        ]},
        "part2": {
            "prompt": "Describe a book or film that made a strong impression on you.",
            "points": ["what it was", "when you read or watched it", "what it was about"],
            "closing": "and explain why it made such an impression on you.",
        },
        "part3": {"topic": "Media and storytelling", "questions": [
            "Why do you think some stories stay popular for generations?",
            "Do films based on books usually do them justice?",
            "How has social media changed the way people get news?",
            "Should governments control what children can watch online?",
        ]},
    },
    {
        "id": "work",
        "title": "Test 5 · Work & decisions",
        "part1": {"topic": "Weather", "questions": [
            "What's the weather like where you live?",
            "What's your favourite season? Why?",
            "Does the weather affect your mood?",
            "Have you ever experienced extreme weather?",
        ]},
        "part2": {
            "prompt": "Describe an important decision you made.",
            "points": ["what the decision was", "when you made it", "how you made it"],
            "closing": "and explain why it was important to you.",
        },
        "part3": {"topic": "Decisions and careers", "questions": [
            "What kinds of decisions do young people find hardest to make?",
            "Should parents help their children choose a career?",
            "Do people today have too many choices?",
            "Is it better to make decisions quickly or to take time over them?",
        ]},
    },
]


def cue_card_text(part2: dict) -> str:
    """The Part 2 question as stored with the answer, so feedback sees the full task."""
    points = "; ".join(part2["points"])
    return f"{part2['prompt']} You should say: {points}; {part2['closing']}"


for test in MOCK_TESTS:
    test["part2"]["question"] = cue_card_text(test["part2"])
