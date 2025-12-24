import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../src'))
from app import parse_chat_command

def test_parse_chat_simple_increase():
    updates, responses = parse_chat_command("increase brightness")
    assert updates["brightness"] > 0
    assert "increased brightness" in responses

def test_parse_chat_simple_decrease():
    updates, responses = parse_chat_command("decrease brightness")
    assert updates["brightness"] < 0
    assert "decreased brightness" in responses

def test_parse_chat_compound_mixed():
    updates, responses = parse_chat_command("increase brightness and decrease shadow")
    assert updates["brightness"] > 0
    assert updates["shadow_opacity"] < 0
    assert "increased brightness" in responses
    assert "decreased shadow opacity" in responses

def test_parse_chat_compound_implicit():
    # "Darker" implies less brightness
    updates, responses = parse_chat_command("make it darker")
    assert updates["brightness"] < 0

    # "Softer shadow" implies blur increase or distinct logic?
    # In my mapping: "softer shadow" is in increase_keywords for shadow_blur ("softer shadow", "diffuse")
    updates, responses = parse_chat_command("softer shadow")
    assert updates["shadow_blur"] > 0

def test_parse_chat_reduce_modifier():
    updates, responses = parse_chat_command("reduce contrast")
    assert updates["contrast"] < 0
    assert "decreased contrast" in responses
