from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import sys

output_path = sys.argv[1] if len(sys.argv) > 1 else "Getting Started.pdf"

doc = SimpleDocTemplate(
    output_path,
    pagesize=letter,
    topMargin=0.75*inch,
    bottomMargin=0.75*inch,
    leftMargin=0.85*inch,
    rightMargin=0.85*inch
)

styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Title'],
    fontSize=28,
    spaceAfter=6,
    textColor=HexColor('#1a1a1a'),
    fontName='Helvetica-Bold'
)

subtitle_style = ParagraphStyle(
    'Subtitle',
    parent=styles['Normal'],
    fontSize=13,
    spaceAfter=24,
    textColor=HexColor('#555555'),
    fontName='Helvetica',
    alignment=TA_CENTER
)

heading_style = ParagraphStyle(
    'CustomHeading',
    parent=styles['Heading1'],
    fontSize=18,
    spaceBefore=20,
    spaceAfter=10,
    textColor=HexColor('#1a1a1a'),
    fontName='Helvetica-Bold'
)

subheading_style = ParagraphStyle(
    'CustomSubheading',
    parent=styles['Heading2'],
    fontSize=14,
    spaceBefore=14,
    spaceAfter=6,
    textColor=HexColor('#333333'),
    fontName='Helvetica-Bold'
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=11,
    leading=16,
    spaceAfter=8,
    textColor=HexColor('#2a2a2a'),
    fontName='Helvetica'
)

bold_body_style = ParagraphStyle(
    'BoldBody',
    parent=body_style,
    fontName='Helvetica-Bold'
)

callout_style = ParagraphStyle(
    'Callout',
    parent=body_style,
    fontSize=12,
    leading=18,
    spaceBefore=12,
    spaceAfter=12,
    textColor=HexColor('#1a1a1a'),
    fontName='Helvetica-Bold',
    alignment=TA_CENTER,
    backColor=HexColor('#f0f0f0'),
    borderPadding=(12, 12, 12, 12)
)

trigger_style = ParagraphStyle(
    'Trigger',
    parent=body_style,
    fontSize=11,
    fontName='Courier',
    textColor=HexColor('#c0392b')
)

story = []

# Title
story.append(Spacer(1, 30))
story.append(Paragraph("Cowork Starter Pack", title_style))
story.append(Paragraph("Your quick-start guide to working with Claude", subtitle_style))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#cccccc'), spaceAfter=20))

# What is this?
story.append(Paragraph("What Is This?", heading_style))
story.append(Paragraph(
    "You just set up a workspace that gives Claude persistent memory. That means every time you start a new conversation, Claude already knows who you are, what you're working on, and where you left off.",
    body_style
))
story.append(Paragraph(
    "The system is built around one simple idea:",
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "Set a goal \u2192 Break it into problems \u2192 Solve the problems \u2192 Ship the output",
    callout_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "Everything in your workspace is designed to keep you moving through that loop. Claude will always be nudging you toward the next concrete thing to make or do.",
    body_style
))

# How your workspace is organized
story.append(Paragraph("How Your Workspace Is Organized", heading_style))
story.append(Paragraph(
    "Your workspace has two folders:",
    body_style
))

folder_data = [
    [Paragraph("<b>Folder</b>", body_style), Paragraph("<b>What It's For</b>", body_style)],
    [Paragraph("01 Daily Logs/", bold_body_style), Paragraph("Session logs so Claude remembers what you worked on. Claude writes these automatically when you wrap up for the day.", body_style)],
    [Paragraph("02 Projects/", bold_body_style), Paragraph("One folder per project. Each project has an overview file with the goal, why it matters, and problems to solve.", body_style)],
]

folder_table = Table(folder_data, colWidths=[1.8*inch, 4.5*inch])
folder_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
]))
story.append(folder_table)
story.append(Spacer(1, 8))

story.append(Paragraph(
    "There's also a file called <b>CLAUDE.md</b> in your workspace root. This is Claude's memory \u2014 it reads this file at the start of every session. You can open and edit it anytime, but Claude also keeps it updated automatically.",
    body_style
))

# What you can say
story.append(Paragraph("What You Can Say", heading_style))
story.append(Paragraph(
    "You have a few built-in shortcuts that trigger specific workflows. Here's the full list:",
    body_style
))

commands_data = [
    [Paragraph("<b>Say This</b>", body_style), Paragraph("<b>What Happens</b>", body_style)],
    [Paragraph('<font face="Courier" color="#c0392b">/setup</font>', body_style),
     Paragraph("First-time workspace setup. You already did this! Only needs to be run once.", body_style)],
    [Paragraph('<font face="Courier" color="#c0392b">"new project"</font>', body_style),
     Paragraph("Claude interviews you about a new project, creates a folder and overview file, and registers it so every future session knows about it.", body_style)],
    [Paragraph('<font face="Courier" color="#c0392b">"good morning"</font>', body_style),
     Paragraph("Claude reads your recent logs, recaps what you've been working on, recommends what's most important, and helps you pick what to tackle.", body_style)],
    [Paragraph('<font face="Courier" color="#c0392b">"end of day"</font> or <font face="Courier" color="#c0392b">"wrap up"</font>', body_style),
     Paragraph("Claude logs everything from your session \u2014 what you worked on, what was built, what's still open, and where to start tomorrow.", body_style)],
    [Paragraph('<font face="Courier" color="#c0392b">"help"</font> or <font face="Courier" color="#c0392b">"what can you do?"</font>', body_style),
     Paragraph("Shows you everything Claude can help with. Use this anytime you're not sure what to do next.", body_style)],
]

commands_table = Table(commands_data, colWidths=[2.2*inch, 4.1*inch])
commands_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
]))
story.append(commands_table)
story.append(Spacer(1, 8))

story.append(Paragraph(
    "Beyond these shortcuts, you can just talk to Claude normally. Ask it to research something, write something, brainstorm ideas, solve a problem \u2014 whatever you need. The shortcuts above are just quick triggers for common workflows.",
    body_style
))

# Your daily workflow
story.append(Paragraph("Your Daily Workflow", heading_style))
story.append(Paragraph(
    "Here's how a typical day looks:",
    body_style
))

step_data = [
    [Paragraph("<b>Step</b>", body_style), Paragraph("<b>What To Do</b>", body_style)],
    [Paragraph("<b>1. Start your day</b>", body_style),
     Paragraph('Say <font face="Courier" color="#c0392b">"good morning"</font> \u2014 Claude catches you up and helps you pick what to work on.', body_style)],
    [Paragraph("<b>2. Work on your project</b>", body_style),
     Paragraph("Just talk to Claude about whatever you're working on. Ask questions, get help, create things. Claude keeps everything in the right project folder.", body_style)],
    [Paragraph("<b>3. Wrap up</b>", body_style),
     Paragraph('Say <font face="Courier" color="#c0392b">"wrap up"</font> or <font face="Courier" color="#c0392b">"end of day"</font> \u2014 Claude logs what happened so the next session picks up right where you left off.', body_style)],
]

step_table = Table(step_data, colWidths=[1.8*inch, 4.5*inch])
step_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
]))
story.append(step_table)

# Tips
story.append(Paragraph("Tips", heading_style))

story.append(Paragraph(
    "<b>Start with one project.</b> Don't try to set up everything at once. Say \"new project\", get one thing going, and build from there.",
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "<b>Define your problems clearly.</b> The more specific your open problems are, the more useful Claude's help will be. \"Make more money\" is vague. \"Figure out pricing for my freelance design proposals\" is something Claude can actually help solve.",
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "<b>Always wrap up.</b> The end-of-day log is what makes the next session great. Without it, Claude starts with no memory of what you did. With it, you pick up right where you left off.",
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "<b>You can edit CLAUDE.md yourself.</b> It's just a text file. If you want to change how Claude talks to you, add instructions, or update your projects manually, open it and make changes. Claude reads it fresh every session.",
    body_style
))

# What's next
story.append(Spacer(1, 16))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#cccccc'), spaceBefore=8, spaceAfter=16))
story.append(Paragraph(
    "That's everything you need. Say <font face='Courier' color='#c0392b'>\"new project\"</font> to get started.",
    ParagraphStyle('Closing', parent=body_style, fontSize=12, alignment=TA_CENTER, fontName='Helvetica-Bold')
))

doc.build(story)
print(f"PDF created at: {output_path}")
