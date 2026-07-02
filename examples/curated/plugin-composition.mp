u:=1u;
pair A,B,O,C;
A=(-3u,0); B=(3u,0); O=(0,0); C=(2u,2u);
draw O--C;
arrow_label(A, B, btex $AB$ etex, 0.4u);
angle_mark(A, O, C, 7pt, btex $\alpha$ etex, blue);
dotlabel.bot(btex $O$ etex, O);
