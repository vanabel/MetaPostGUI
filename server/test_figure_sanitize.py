from figure_sanitize import sanitize_figure


def test_withpen_pencircle_dashed_evenly():
    src = "draw fullcircle scaled 0.926u shifted (2.531u,1.526u) withpen pencircle dashed evenly;"
    out = sanitize_figure(src)
    assert "withpen pencircle scaled 1pt dashed evenly" in out
    assert "withpen pencircle dashed evenly" not in out


def test_withpen_dashed_evenly_only():
    src = "draw fullcircle scaled 1u shifted (0,0) withpen dashed evenly;"
    out = sanitize_figure(src)
    assert "withpen pencircle scaled 1pt dashed evenly" in out


def test_path_assign_semicolon():
    src = "pat[0]=((0,0)..(1,0)..cycle) scaled u\ndraw pat[0];"
    out = sanitize_figure(src)
    assert "pat[0]=((0,0)..(1,0)..cycle) scaled u;" in out


def test_multiline_draw_with_dir_markers():
    src = """def draw_angle_(expr A,O,B,d) =
draw (O + d*unitvector(A-O))
{ d*unitvector(A-O) rotated 90 }
..
{ d*unitvector(B-O) rotated 90 }
(O + d*unitvector(B-O));
enddef;"""
    out = sanitize_figure(src)
    assert "def draw_angle_(expr A,O,B,d) =" in out
    assert "{ d*unitvector(A-O) rotated 90 }" in out
    assert out.count("draw (O + d*unitvector(A-O))") == 1
    # path must stay one statement — no orphan line starting with {
    assert "\n{ d*unitvector" not in out
    merged_draw = "draw (O + d*unitvector(A-O)) { d*unitvector(A-O) rotated 90 } .."
    assert merged_draw in out.replace("\n", " ") or merged_draw in out


def test_multiline_draw_compiles_with_mpost():
    from pathlib import Path

    from compiler import compile_figure
    from macro_parser import normalize_mpostdef_source

    fig_path = Path(__file__).resolve().parent.parent / "examples" / "tlhiv" / "050.mp"
    if not fig_path.is_file():
        return
    from tex_paths import find_mpost

    if not find_mpost(Path(__file__).resolve().parent.parent / "config"):
        return
    figure = fig_path.read_text(encoding="utf-8")
    result = compile_figure(figure=figure, mpostdef="")
    assert result.ok, result.log[-400:]
